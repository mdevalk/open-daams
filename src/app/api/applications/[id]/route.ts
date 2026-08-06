import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

const MANAGE_ROLES = ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'] as const;
const STAFF_ROLES = ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN', 'DATA_HOLDER'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
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

    const requestingUserId = req.nextUrl.searchParams.get('userId');
    const requestingUser = requestingUserId ? await prisma.user.findUnique({ where: { id: requestingUserId } }) : null;
    const isStaff = requestingUser ? STAFF_ROLES.includes(requestingUser.role) : false;

    return NextResponse.json({
      ...application,
      notes: isStaff ? application.notes : application.notes.filter((n) => !n.isInternal),
    });
  } catch (e) {
    console.error(`Failed to fetch application ${id}`, e);
    const message = e instanceof Error ? e.message : 'Failed to fetch application';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// The only caller today (EthicalReviewPanel.tsx) only ever sends
// ethicalReview* fields — this route stays scoped to exactly that.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();

    const auth = await requireRole(body.actingUserId, [...MANAGE_ROLES]);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const application = await prisma.application.update({
      where: { id },
      data: {
        ...(body.ethicalReviewRequired !== undefined ? { ethicalReviewRequired: body.ethicalReviewRequired } : {}),
        ...(body.ethicalReviewStatus !== undefined ? { ethicalReviewStatus: body.ethicalReviewStatus } : {}),
        ...(body.ethicalReviewBody !== undefined ? { ethicalReviewBody: body.ethicalReviewBody } : {}),
        ...(body.ethicalReviewReference !== undefined ? { ethicalReviewReference: body.ethicalReviewReference } : {}),
        ...(body.ethicalReviewDate !== undefined
          ? { ethicalReviewDate: body.ethicalReviewDate ? new Date(body.ethicalReviewDate) : null }
          : {}),
      },
    });

    return NextResponse.json(application);
  } catch (e) {
    console.error(`Failed to update application ${id}`, e);
    const message = e instanceof Error ? e.message : 'Failed to update application';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
