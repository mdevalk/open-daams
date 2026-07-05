import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  getAvailableTransitions,
  calculateDecisionDeadline,
  calculateAdditionalInfoDeadline,
} from '@/lib/workflow';
import { ApplicationStatus, DecisionOutcome } from '@prisma/client';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    // body: { toStatus, userId, comment, decisionOutcome? }

    const application = await prisma.application.findUnique({ where: { id } });
    if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const user = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 400 });

    const available = getAvailableTransitions(application.status, application.type, user.role);
    const transition = available.find(
      (t) =>
        t.to === body.toStatus &&
        (!t.requiresDecisionOutcome || t.requiresDecisionOutcome === body.decisionOutcome),
    );

    if (!transition) {
      return NextResponse.json(
        { error: `Transition to ${body.toStatus} not allowed from ${application.status} for role ${user.role}` },
        { status: 422 },
      );
    }

    const now = new Date();
    const toStatus = body.toStatus as ApplicationStatus;
    const updates: Record<string, unknown> = { status: toStatus };

    if (toStatus === 'SUBMITTED') {
      updates.submittedAt = now;
      updates.decisionDeadline = calculateDecisionDeadline(now);
      // Art. 57(1)(j)(ii): publish without undue delay after initial reception
      updates.publishedAt = now;
    }

    if (toStatus === 'AWAITING_ADDITIONAL_INFORMATION') {
      // D6.4 §8: void the decision deadline while awaiting additional information
      updates.decisionDeadline = null;
      updates.additionalInfoDeadline = calculateAdditionalInfoDeadline(now);
    }

    if (toStatus === 'PRE_SCREENING' && application.status === 'AWAITING_ADDITIONAL_INFORMATION') {
      // D6.4 §8: recalculate decision deadline from timestamp of additional info receipt
      updates.additionalInfoDeadline = null;
      updates.additionalInfoReceivedAt = now;
      updates.decisionDeadline = calculateDecisionDeadline(now, application.deadlineExtended);
    }

    if (toStatus === 'DECISION_ISSUED') {
      updates.decisionOutcome = body.decisionOutcome as DecisionOutcome;
      updates.decisionAt = now;
      updates.decisionSummary = body.comment ?? null;
      updates.additionalInfoDeadline = null;
      // Art. 58 / 61(4): decisions/refusals published within 30 working days
      updates.decisionPublishedAt = now;
    }

    const [updated] = await prisma.$transaction([
      prisma.application.update({ where: { id }, data: updates }),
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
  } catch (e) {
    console.error('Failed to transition application', e);
    const message = e instanceof Error ? e.message : 'Failed to transition application';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
