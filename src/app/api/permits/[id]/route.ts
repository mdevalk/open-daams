import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PERMIT_TRANSITIONS } from '@/lib/permit';
import { DataPermitStatus } from '@prisma/client';
import { regenerateStoredPermitPdf } from '@/lib/permit-pdf-store';

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
  try {
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

    // Direct transitions here are only REVOKE / EXPIRE — terminal actions on the
    // current version that do NOT create a new version (amendments, renewals and
    // revocation appeals go through /change-requests, which issues a new version).
    const updates: Record<string, unknown> = { status: toStatus };

    if (toStatus === 'REVOKED') {
      updates.revocationReason = body.comment ?? null;
      updates.revocationAt = now;
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

    // The permit document shows status/revocation — regenerate.
    await regenerateStoredPermitPdf(id, prisma);

    return NextResponse.json(updated);
  } catch (e) {
    console.error('Failed to transition permit', e);
    const message = e instanceof Error ? e.message : 'Failed to transition permit';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
