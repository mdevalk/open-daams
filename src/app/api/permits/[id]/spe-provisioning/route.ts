import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { SPE_TRANSITIONS } from '@/lib/spe';
import { SpeProvisioningStatus } from '@prisma/client';

const MANAGE_ROLES = ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'] as const;

/**
 * POST /api/permits/[id]/spe-provisioning
 * Request SPE provisioning for a granted data-access permit
 * (EHDS Art. 73 / TEHDAS2 D6.4 §9). Only one order per permit.
 * body: { userId }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const authz = await requireRole(body.userId, [...MANAGE_ROLES]);
    if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status });

    const permit = await prisma.dataPermit.findUnique({
      where: { id },
      include: { application: { select: { type: true } }, speProvisioning: true },
    });
    if (!permit) return NextResponse.json({ error: 'Permit not found' }, { status: 404 });
    if (permit.application.type !== 'DATA_ACCESS_APPLICATION') {
      return NextResponse.json({ error: 'SPE provisioning only applies to data access applications' }, { status: 422 });
    }
    if (permit.speProvisioning) {
      return NextResponse.json({ error: 'An SPE provisioning order already exists for this permit' }, { status: 409 });
    }

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.speProvisioningOrder.create({
        data: { permitId: id },
      });
      await tx.speProvisioningLog.create({
        data: {
          orderId: created.id,
          userId: authz.user.id,
          toStatus: 'REQUESTED',
          comment: 'SPE provisioning requested',
        },
      });
      return created;
    });

    return NextResponse.json(order, { status: 201 });
  } catch (e) {
    console.error('Failed to request SPE provisioning', e);
    const message = e instanceof Error ? e.message : 'Failed to request SPE provisioning';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/permits/[id]/spe-provisioning
 * Transition the SPE provisioning order.
 * body: { userId, toStatus, environmentReference?, comment? }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const order = await prisma.speProvisioningOrder.findUnique({ where: { permitId: id } });
    if (!order) return NextResponse.json({ error: 'No SPE provisioning order found for this permit' }, { status: 404 });

    const authz = await requireRole(body.userId, [...MANAGE_ROLES]);
    if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status });

    const toStatus = body.toStatus as SpeProvisioningStatus;
    const available = SPE_TRANSITIONS[order.status] ?? [];
    const transition = available.find((t) => t.to === toStatus);
    if (!transition) {
      return NextResponse.json({ error: `Transition to ${toStatus} not allowed from ${order.status}` }, { status: 422 });
    }
    if (transition.requiresEnvironmentReference && !body.environmentReference && !order.environmentReference) {
      return NextResponse.json({ error: 'An environment reference is required to mark the SPE active' }, { status: 422 });
    }

    const now = new Date();
    const updates: Record<string, unknown> = { status: toStatus };
    if (body.environmentReference) updates.environmentReference = body.environmentReference;
    if (toStatus === 'ACTIVE') updates.provisionedAt = now;
    if (toStatus === 'DECOMMISSIONED') updates.decommissionedAt = now;

    const [updated] = await prisma.$transaction([
      prisma.speProvisioningOrder.update({ where: { id: order.id }, data: updates }),
      prisma.speProvisioningLog.create({
        data: {
          orderId: order.id,
          userId: authz.user.id,
          fromStatus: order.status,
          toStatus,
          comment: body.comment ?? null,
        },
      }),
    ]);

    return NextResponse.json(updated);
  } catch (e) {
    console.error('Failed to update SPE provisioning', e);
    const message = e instanceof Error ? e.message : 'Failed to update SPE provisioning';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
