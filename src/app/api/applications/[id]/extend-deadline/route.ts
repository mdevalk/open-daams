import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { calculateDecisionDeadline } from '@/lib/workflow';

const MANAGE_ROLES = ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'] as const;

/**
 * POST /api/applications/[id]/extend-deadline
 * Extend the decision deadline once, with a required written justification
 * (TEHDAS2 D6.4 R8.0.8, EHDS Art. 68). Recomputes from the original
 * submission date, not "now" — the extension is "+N months from
 * submission," not "+N months from today."
 * body: { reason, actingUserId }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const auth = await requireRole(body.actingUserId, [...MANAGE_ROLES]);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) return NextResponse.json({ error: 'A written justification is required' }, { status: 422 });

    const application = await prisma.application.findUnique({ where: { id } });
    if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (['DECISION_ISSUED', 'WITHDRAWN'].includes(application.status)) {
      return NextResponse.json({ error: 'Cannot extend the deadline of a closed application' }, { status: 422 });
    }
    if (application.deadlineExtended) {
      return NextResponse.json({ error: 'The deadline has already been extended once' }, { status: 409 });
    }
    if (!application.submittedAt) {
      return NextResponse.json({ error: 'Application has no submission date to extend from' }, { status: 422 });
    }

    const decisionDeadline = calculateDecisionDeadline(application.submittedAt, application.decisionTrack, true);

    const updated = await prisma.$transaction(async (tx) => {
      const app = await tx.application.update({
        where: { id },
        data: { deadlineExtended: true, deadlineExtensionReason: reason, decisionDeadline },
      });
      await tx.applicationLog.create({
        data: {
          applicationId: id,
          userId: auth.user.id,
          fromStatus: application.status,
          toStatus: application.status,
          action: 'Beslistermijn verlengd',
          comment: reason,
        },
      });
      return app;
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error('Failed to extend deadline', e);
    const message = e instanceof Error ? e.message : 'Failed to extend deadline';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
