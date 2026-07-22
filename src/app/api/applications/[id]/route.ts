import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const application = await prisma.application.findUnique({
    where: { id },
    include: {
      applicant: true,
      caseHandler: true,
      auditLogs: {
        include: { user: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
      notes: {
        include: { author: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: 'desc' },
      },
      documents: { orderBy: { uploadedAt: 'desc' } },
      appeals: { orderBy: { submittedAt: 'desc' } },
    },
  });

  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(application);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const application = await prisma.application.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.projectDescription !== undefined ? { projectDescription: body.projectDescription } : {}),
      ...(body.purposeCategory !== undefined ? { purposeCategory: body.purposeCategory } : {}),
      ...(body.requestedVariables !== undefined ? { requestedVariables: body.requestedVariables } : {}),
      ...(body.studyPopulation !== undefined ? { studyPopulation: body.studyPopulation } : {}),
      ...(body.inclusionCriteria !== undefined ? { inclusionCriteria: body.inclusionCriteria } : {}),
      ...(body.exclusionCriteria !== undefined ? { exclusionCriteria: body.exclusionCriteria } : {}),
      ...(body.legalBasis !== undefined ? { legalBasis: body.legalBasis } : {}),
      ...(body.isCrossBorder !== undefined ? { isCrossBorder: body.isCrossBorder } : {}),
      ...(body.caseHandlerId !== undefined ? { caseHandlerId: body.caseHandlerId } : {}),
      ...(body.decisionSummary !== undefined ? { decisionSummary: body.decisionSummary } : {}),
      ...(body.ethicalReviewRequired !== undefined ? { ethicalReviewRequired: body.ethicalReviewRequired } : {}),
      ...(body.ethicalReviewStatus !== undefined ? { ethicalReviewStatus: body.ethicalReviewStatus } : {}),
      ...(body.ethicalReviewBody !== undefined ? { ethicalReviewBody: body.ethicalReviewBody } : {}),
      ...(body.ethicalReviewReference !== undefined ? { ethicalReviewReference: body.ethicalReviewReference } : {}),
      ...(body.ethicalReviewDate !== undefined
        ? { ethicalReviewDate: body.ethicalReviewDate ? new Date(body.ethicalReviewDate) : null }
        : {}),
      ...(body.permitNumber !== undefined ? { permitNumber: body.permitNumber } : {}),
      ...(body.permitValidFrom !== undefined ? { permitValidFrom: new Date(body.permitValidFrom) } : {}),
      ...(body.permitValidUntil !== undefined ? { permitValidUntil: new Date(body.permitValidUntil) } : {}),
    },
  });

  if (body.requestedDatasets !== undefined) {
    const dataHolderGroups = Array.isArray(body.requestedDatasets) ? body.requestedDatasets : [];
    await prisma.$transaction([
      prisma.requestedDataset.deleteMany({ where: { applicationId: id } }),
      prisma.requestedDataset.createMany({
        data: dataHolderGroups.flatMap(
          (g: { dataHolderName: string; datasets: { name: string; url?: string | null }[] }) =>
            g.datasets.map((d) => ({
              applicationId: id,
              dataHolderName: g.dataHolderName,
              name: d.name,
              url: d.url || null,
            })),
        ),
      }),
    ]);
  }

  return NextResponse.json(application);
}
