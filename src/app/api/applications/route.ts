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
  const body = await req.json();
  const now = new Date();

  const referenceNumber = `HDAB-${now.getFullYear()}-${String(await nextSeq()).padStart('4', '0')}`;

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
}

async function nextSeq() {
  const count = await prisma.application.count();
  return count + 1;
}
