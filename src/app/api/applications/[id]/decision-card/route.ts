import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

/**
 * PATCH /api/applications/[id]/decision-card
 * Record the applicant's response to a positive decision's pre-permit
 * conditions (D6.4 §9.2). APPLICANT responds for itself via the "acting as"
 * role switcher; CASE_HANDLER/ADMIN can record a response received through
 * another channel, or complete an overdue no-response case as a decline —
 * same endpoint, no separate "timeout" path (mirrors how the also-unimplemented-
 * as-cron 4-week AWAITING_ADDITIONAL_INFORMATION no-response case is handled:
 * surfaced as overdue, completed via the normal action).
 * body: { status: 'ACCEPTED' | 'DECLINED', actingUserId, comment? }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const auth = await requireRole(body.actingUserId, ['APPLICANT', 'CASE_HANDLER', 'ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (body.status !== 'ACCEPTED' && body.status !== 'DECLINED') {
      return NextResponse.json({ error: 'status must be ACCEPTED or DECLINED' }, { status: 422 });
    }

    const application = await prisma.application.findUnique({ where: { id } });
    if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (
      application.status !== 'DECISION_ISSUED' ||
      application.decisionOutcome !== 'POSITIVE' ||
      application.permitAcceptanceStatus !== 'PENDING'
    ) {
      return NextResponse.json(
        { error: 'No pending pre-permit acceptance for this application' },
        { status: 422 },
      );
    }

    const now = new Date();
    const applicationUpdate =
      body.status === 'ACCEPTED'
        ? { permitAcceptanceStatus: 'ACCEPTED' as const, permitAcceptedAt: now }
        : { permitAcceptanceStatus: 'DECLINED' as const, status: 'WITHDRAWN' as const };

    const [updated] = await prisma.$transaction([
      prisma.application.update({ where: { id }, data: applicationUpdate }),
      prisma.auditLog.create({
        data: {
          applicationId: id,
          userId: body.actingUserId,
          fromStatus: application.status,
          toStatus: body.status === 'DECLINED' ? 'WITHDRAWN' : application.status,
          action: body.status === 'ACCEPTED' ? 'Pre-permit accepted' : 'Pre-permit declined — application withdrawn',
          comment: body.comment ?? null,
        },
      }),
    ]);

    return NextResponse.json(updated);
  } catch (e) {
    console.error('Failed to record pre-permit response', e);
    const message = e instanceof Error ? e.message : 'Failed to record pre-permit response';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
