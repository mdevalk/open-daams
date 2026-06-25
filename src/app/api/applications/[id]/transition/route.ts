import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAvailableTransitions, calculateDecisionDeadline, calculateIncompleteDeadline } from '@/lib/workflow';
import { ApplicationStatus } from '@prisma/client';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  // body: { toStatus, userId, comment }

  const application = await prisma.application.findUnique({ where: { id } });
  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const user = await prisma.user.findUnique({ where: { id: body.userId } });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 400 });

  const available = getAvailableTransitions(application.status, application.type, user.role);
  const transition = available.find((t) => t.to === body.toStatus);
  if (!transition) {
    return NextResponse.json(
      { error: `Transition to ${body.toStatus} not allowed from ${application.status} for role ${user.role}` },
      { status: 422 },
    );
  }

  const now = new Date();
  const toStatus = body.toStatus as ApplicationStatus;

  // Compute deadline updates
  const deadlineUpdates: Record<string, Date | null | boolean> = {};
  if (toStatus === 'SUBMITTED') {
    deadlineUpdates.submittedAt = now;
    deadlineUpdates.decisionDeadline = calculateDecisionDeadline(now);
  }
  if (toStatus === 'INCOMPLETE') {
    deadlineUpdates.incompleteDeadline = calculateIncompleteDeadline(now);
  }

  const [updated] = await prisma.$transaction([
    prisma.application.update({
      where: { id },
      data: { status: toStatus, ...deadlineUpdates },
    }),
    prisma.auditLog.create({
      data: {
        applicationId: id,
        userId: body.userId,
        fromStatus: application.status,
        toStatus,
        action: transition.label,
        comment: body.comment ?? null,
      },
    }),
  ]);

  return NextResponse.json(updated);
}
