import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { DECIDE_ROLES, APPROVAL_EFFECT } from '@/lib/permit-change';
import { nextPermitNumber } from '@/lib/permit';

/**
 * PATCH /api/permits/[id]/change-requests/[requestId]
 * Approve or reject a change request. Approving drives the DataPermit status change
 * and issues a new permit version (D6.4 R9.3.6); rejecting leaves the permit unchanged.
 * body: { decision: 'APPROVED' | 'REJECTED', userId, comment?, newValidUntil? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  try {
    const { id, requestId } = await params;
    const body = await req.json();

    const decision = body.decision as 'APPROVED' | 'REJECTED';
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      return NextResponse.json({ error: 'decision must be APPROVED or REJECTED' }, { status: 400 });
    }

    const auth = await requireRole(body.userId, [...DECIDE_ROLES]);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const request = await prisma.permitChangeRequest.findUnique({
      where: { id: requestId },
      include: { permit: true },
    });
    if (!request || request.permitId !== id) {
      return NextResponse.json({ error: 'Change request not found' }, { status: 404 });
    }
    if (request.status !== 'REQUESTED') {
      return NextResponse.json({ error: 'This request has already been decided' }, { status: 422 });
    }

    const now = new Date();

    if (decision === 'REJECTED') {
      const updated = await prisma.permitChangeRequest.update({
        where: { id: requestId },
        data: { status: 'REJECTED', decidedById: auth.user.id, decidedAt: now, decisionComment: body.comment ?? null },
      });
      return NextResponse.json(updated);
    }

    // APPROVED — drive the permit status change, issue a new version, log it.
    const effect = APPROVAL_EFFECT[request.type];
    const permit = request.permit;
    const newValidUntil =
      request.type === 'RENEWAL' && body.newValidUntil ? new Date(body.newValidUntil) : undefined;
    if (request.type === 'RENEWAL' && !newValidUntil) {
      return NextResponse.json({ error: 'A new validUntil date is required to approve a renewal' }, { status: 400 });
    }

    const permitUpdates: Record<string, unknown> = {
      status: effect.to,
      permitNumber: effect.newVersion ? nextPermitNumber(permit.permitNumber) : permit.permitNumber,
      previousPermitId: effect.newVersion ? permit.id : permit.previousPermitId,
    };
    if (newValidUntil) permitUpdates.validUntil = newValidUntil;
    if (request.type === 'REVOCATION_APPEAL') {
      // reinstated — clear the revocation markers
      permitUpdates.revocationReason = null;
      permitUpdates.revocationAt = null;
    }

    const [updatedRequest] = await prisma.$transaction([
      prisma.permitChangeRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          decidedById: auth.user.id,
          decidedAt: now,
          decisionComment: body.comment ?? null,
          newValidUntil: newValidUntil ?? null,
        },
      }),
      prisma.dataPermit.update({ where: { id }, data: permitUpdates }),
      prisma.dataPermitLog.create({
        data: {
          permitId: id,
          userId: auth.user.id,
          fromStatus: permit.status,
          toStatus: effect.to,
          action: `${request.type} approved`,
          comment: body.comment ?? null,
        },
      }),
    ]);
    return NextResponse.json(updatedRequest);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to decide change request';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
