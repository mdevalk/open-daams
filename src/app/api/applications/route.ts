import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ApplicationStatus, ApplicationType } from '@prisma/client';
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
      applicant: { select: { id: true, name: true, organisation: true } },
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

    const referenceNumber = `HDAB-${now.getFullYear()}-${String(await nextSeq()).padStart(4, '0')}`;
    const isDataAccessApplication = body.type === 'DATA_ACCESS_APPLICATION';

    const application = await prisma.application.create({
      data: {
        referenceNumber,
        type: body.type,
        status: 'DRAFT',
        applicantId: body.applicantId,
        title: body.title,
        projectDescription: body.projectDescription ?? '',
        purposeCategory: body.purposeCategory ?? '',
        requestedDatasets: body.requestedDatasets ?? [],
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
        decisionTrack: body.decisionTrack === 'EXPEDITED' ? 'EXPEDITED' : 'STANDARD',

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
      },
    });

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

async function nextSeq() {
  const count = await prisma.application.count();
  return count + 1;
}
