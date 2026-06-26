import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PERMIT_TRANSITIONS, nextPermitNumber } from '@/lib/permit';
import { DataPermitStatus } from '@prisma/client';

/**
 * GET /api/permits/[id]  — fetch permit with logs
 * POST /api/permits/[id] — transition permit status (D6.4 §9.2)
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const permit = await prisma.dataPermit.findUnique({
    where: { id },
    include: {
      application: { select: { referenceNumber: true, title: true, type: true } },
      logs: {
        include: { user: { select: { name: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!permit) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(permit);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  // body: { toStatus, userId, comment, validUntil? (for RENEWED) }

  const permit = await prisma.dataPermit.findUnique({ where: { id } });
  if (!permit) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const user = await prisma.user.findUnique({ where: { id: body.userId } });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 400 });

  const available = PERMIT_TRANSITIONS[permit.status] ?? [];
  const transition = available.find((t) => t.to === body.toStatus && t.requiredRole.includes(user.role));
  if (!transition)
    return NextResponse.json(
      { error: `Transition to ${body.toStatus} not allowed from ${permit.status} for role ${user.role}` },
      { status: 422 },
    );

  const toStatus = body.toStatus as DataPermitStatus;
  const now = new Date();

  // D6.4 §9.2: AMENDED and RENEWED generate a new permit ID
  const newPermitNumber = transition.generatesNewPermitId
    ? nextPermitNumber(permit.permitNumber)
    : permit.permitNumber;

  const updates: Record<string, unknown> = {
    status: toStatus,
    permitNumber: newPermitNumber,
    previousPermitId: transition.generatesNewPermitId ? permit.id : permit.previousPermitId,
  };

  if (toStatus === 'REVOKED') {
    updates.revocationReason = body.comment ?? null;
    updates.revocationAt = now;
  }
  if (toStatus === 'RENEWED' && body.validUntil) {
    updates.validUntil = new Date(body.validUntil);
  }

  const [updated] = await prisma.$transaction([
    prisma.dataPermit.update({ where: { id }, data: updates }),
    prisma.dataPermitLog.create({
      data: {
        permitId: id,
        userId: body.userId,
        fromStatus: permit.status,
        toStatus,
        action: transition.label,
        comment: body.comment ?? null,
      },
    }),
  ]);

  return NextResponse.json(updated);
}
