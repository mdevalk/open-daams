import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ApplicationStatus, ApplicationType, Prisma } from '@prisma/client';
import { calculateDecisionDeadline } from '@/lib/workflow';
import { addWeeks } from 'date-fns';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const status = searchParams.get('status') as ApplicationStatus | null;
  const type = searchParams.get('type') as ApplicationType | null;
  const search = searchParams.get('search');

  const applications = await prisma.application.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(search ? {
        OR: [
          { referenceNumber: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    },
    include: {
      applicant: { select: { id: true, name: true, dataUser: { select: { name: true } } } },
      caseHandler: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json(applications);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const now = new Date();
    const isDataAccessApplication = body.type === 'DATA_ACCESS_APPLICATION';

    const applicationData = {
      type: body.type,
      status: 'DRAFT' as const,
      applicantId: body.applicantId,
      title: body.title,
      projectDescription: body.projectDescription ?? '',
      purposeCategory: body.purposeCategory ?? '',
      requestedVariables: body.requestedVariables ?? '',
      studyPopulation: body.studyPopulation ?? '',
      inclusionCriteria: body.inclusionCriteria ?? '',
      exclusionCriteria: body.exclusionCriteria ?? '',
      dataStartDate: body.dataStartDate ? new Date(body.dataStartDate) : null,
      dataEndDate: body.dataEndDate ? new Date(body.dataEndDate) : null,
      projectStartDate: body.projectStartDate ? new Date(body.projectStartDate) : null,
      projectEndDate: body.projectEndDate ? new Date(body.projectEndDate) : null,
      legalBasis: body.legalBasis ?? '',
      dataProcessingCountry: body.dataProcessingCountry ?? 'NL',
      isCrossBorder: body.isCrossBorder ?? false,
      decisionTrack: body.decisionTrack === 'EXPEDITED' ? 'EXPEDITED' as const : 'STANDARD' as const,

      // Cohort/dataset extraction (Annex 5 §6.1 / Annex 6 §6.1 — shared)
      cohortSizeIsEstimate: body.cohortSizeIsEstimate ?? null,
      cohortSize: body.cohortSize ? Number(body.cohortSize) : null,
      cohortSizeJustification: body.cohortSizeJustification || null,
      extractionMethod: body.extractionMethod || null,
      sampleSize: body.sampleSize || null,
      samplingMethodDescription: body.samplingMethodDescription || null,
      extractionFrequency: body.extractionFrequency || null,
      extractionInterval: body.extractionInterval || null,
      extractionIntervalOther: body.extractionIntervalOther || null,
      extractionTimingNotes: body.extractionTimingNotes || null,

      // Opt-out exception (Annex 5 §8 / Annex 6 §6, EHDS Art. 71(4))
      usesOptOutException: body.usesOptOutException ?? false,
      optOutExceptionJustification: body.optOutExceptionJustification || null,

      // Data access application only (Annex 5 §6.1–6.3, 7, 8)
      cohortFormationMethod: isDataAccessApplication ? (body.cohortFormationMethod || null) : null,
      dataSubjectsInformed: isDataAccessApplication ? (body.dataSubjectsInformed ?? null) : null,
      dataSubjectsInformedDetail: isDataAccessApplication ? (body.dataSubjectsInformedDetail || null) : null,
      includesControls: isDataAccessApplication ? (body.includesControls ?? false) : false,
      controlsDescription: isDataAccessApplication ? (body.controlsDescription || null) : null,
      includesRelatives: isDataAccessApplication ? (body.includesRelatives ?? false) : false,
      relativesDescription: isDataAccessApplication ? (body.relativesDescription || null) : null,
      otherDataToCombine: isDataAccessApplication ? (body.otherDataToCombine ?? false) : false,
      otherDataDescription: isDataAccessApplication ? (body.otherDataDescription || null) : null,
      speName: isDataAccessApplication ? (body.speName || null) : null,
      speTechnicalRequirements: isDataAccessApplication ? (body.speTechnicalRequirements || null) : null,
      dataAccessTiming: isDataAccessApplication ? (body.dataAccessTiming || null) : null,
      dataAccessLaterDate: isDataAccessApplication && body.dataAccessLaterDate ? new Date(body.dataAccessLaterDate) : null,
      transfersOutsideEuEea: isDataAccessApplication ? (body.transfersOutsideEuEea ?? false) : false,
      transferCountries: isDataAccessApplication ? (body.transferCountries ?? []) : [],
      transferLegalBasis: isDataAccessApplication ? (body.transferLegalBasis || null) : null,
      dataController: isDataAccessApplication ? (body.dataController || null) : null,
      lawfulnessOfProcessing: isDataAccessApplication ? (body.lawfulnessOfProcessing ?? []) : [],

      // Data request only (Annex 6 §6)
      tabulationPlan: !isDataAccessApplication ? (body.tabulationPlan || null) : null,
    };

    // Retry on a referenceNumber collision — see generatePermitNumber's doc
    // comment in permits/route.ts for why count()-based sequencing (the
    // previous approach here) drifts from the true max whenever rows are
    // missing, and generateDecisionId in transition/route.ts for the same
    // retry-loop pattern.
    const MAX_ATTEMPTS = 5;
    let application;
    for (let attempt = 1; ; attempt++) {
      const referenceNumber = await generateReferenceNumber(now.getFullYear());
      try {
        application = await prisma.application.create({
          data: { referenceNumber, ...applicationData },
        });
        break;
      } catch (e) {
        const isUniqueClash =
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002' &&
          (e.meta?.target as string[] | undefined)?.includes('referenceNumber');
        if (isUniqueClash && attempt < MAX_ATTEMPTS) continue;
        throw e;
      }
    }

    const dataHolderGroups: { dataHolderId: string; datasets: { name: string; url?: string | null }[] }[] =
      Array.isArray(body.requestedDatasets) ? body.requestedDatasets : [];
    if (dataHolderGroups.length > 0) {
      const dataHolders = await prisma.dataHolder.findMany({
        where: { id: { in: dataHolderGroups.map((g) => g.dataHolderId) } },
      });
      const nameById = new Map(dataHolders.map((dh) => [dh.id, dh.name]));
      await prisma.requestedDataset.createMany({
        data: dataHolderGroups.flatMap((g) =>
          g.datasets.map((d) => ({
            applicationId: application.id,
            dataHolderId: g.dataHolderId,
            dataHolderName: nameById.get(g.dataHolderId) ?? 'Unknown',
            name: d.name,
            url: d.url || null,
          })),
        ),
      });
    }

    await prisma.auditLog.create({
      data: {
        applicationId: application.id,
        userId: body.applicantId,
        toStatus: 'DRAFT',
        action: 'Application created',
      },
    });

    return NextResponse.json(application, { status: 201 });
  } catch (e) {
    console.error('Failed to create application', e);
    const message = e instanceof Error ? e.message : 'Failed to create application';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Derives the next sequential reference number for the given year from the
 * highest existing HDAB-{year}-NNNN reference, mirroring generatePermitNumber
 * (permits/route.ts) and generateDecisionId (applications/[id]/transition/route.ts)
 * — see their doc comments for why prisma.application.count() (the previous
 * approach) drifts from the true max sequence whenever rows are missing.
 */
async function generateReferenceNumber(year: number): Promise<string> {
  const prefix = `HDAB-${year}-`;
  const last = await prisma.application.findFirst({
    where: { referenceNumber: { startsWith: prefix } },
    orderBy: { referenceNumber: 'desc' },
  });
  const lastSeq = last ? parseInt(last.referenceNumber.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(lastSeq + 1).padStart(4, '0')}`;
}
