import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { DECIDE_ROLES } from '@/lib/permit-change';

/**
 * POST /api/permits/[id]/activate
 * Completes a deferred amendment (D6.4 R9.3.9): [id] is the pending version
 * created by change-requests approval with a future effectiveDate. Flips it
 * to isCurrent, retires its predecessor, and re-points SPE provisioning —
 * the steps that were deliberately skipped at approval time. Lazy/staff-
 * triggered, same as every other deadline-driven transition in this app —
 * no cron enforces this once effectiveAt is reached, it's just surfaced
 * (dashboard, this permit's predecessor page) for staff to complete.
 * body: { userId }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const auth = await requireRole(body.userId, [...DECIDE_ROLES]);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const pending = await prisma.dataPermit.findUnique({
      where: { id },
      include: { previousPermit: true },
    });
    if (!pending) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (!pending.effectiveAt || pending.activatedAt) {
      return NextResponse.json({ error: 'This version is not pending activation' }, { status: 422 });
    }
    if (pending.effectiveAt.getTime() > Date.now()) {
      return NextResponse.json({ error: 'The effective date has not been reached yet' }, { status: 422 });
    }
    if (!pending.previousPermit || !pending.previousPermit.isCurrent) {
      return NextResponse.json(
        { error: 'The predecessor permit is no longer current — cannot activate' },
        { status: 409 },
      );
    }

    const now = new Date();

    await prisma.$transaction([
      prisma.dataPermit.update({ where: { id: pending.previousPermit.id }, data: { isCurrent: false } }),
      prisma.dataPermit.update({ where: { id: pending.id }, data: { isCurrent: true, activatedAt: now } }),
      prisma.speProvisioningOrder.updateMany({
        where: { permitId: pending.previousPermit.id },
        data: { permitId: pending.id },
      }),
      prisma.dataPermitLog.create({
        data: {
          permitId: pending.id,
          userId: auth.user.id,
          fromStatus: pending.previousPermit.status,
          toStatus: pending.status,
          action: 'Amendment activated',
        },
      }),
    ]);

    const updated = await prisma.dataPermit.findUniqueOrThrow({ where: { id: pending.id } });
    return NextResponse.json(updated);
  } catch (e) {
    console.error('Failed to activate permit version', e);
    const message = e instanceof Error ? e.message : 'Failed to activate permit version';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
