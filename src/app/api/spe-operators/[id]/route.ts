import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

/**
 * PATCH /api/spe-operators/[id]
 * Update an SPE operator's masterdata, including which provider it
 * contracts with (ADMIN-only).
 * body: { name?, contactEmail?, contactPhone?, speProviderId?, actingUserId }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const auth = await requireRole(body.actingUserId, ['ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const speOperator = await prisma.speOperator.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
        ...(body.contactEmail !== undefined ? { contactEmail: body.contactEmail || null } : {}),
        ...(body.contactPhone !== undefined ? { contactPhone: body.contactPhone || null } : {}),
        ...(body.speProviderId !== undefined ? { speProviderId: body.speProviderId || null } : {}),
      },
    });

    return NextResponse.json(speOperator);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'An SPE operator with this name already exists' }, { status: 409 });
    }
    console.error('Failed to update SPE operator', e);
    const message = e instanceof Error ? e.message : 'Failed to update SPE operator';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/spe-operators/[id]
 * Remove an SPE operator (ADMIN-only). Blocked with 409 if still referenced
 * by any SPE provisioning order.
 * body: { actingUserId }
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const auth = await requireRole(body.actingUserId, ['ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const speOperator = await prisma.speOperator.findUnique({
      where: { id },
      include: { _count: { select: { provisioningOrders: true } } },
    });
    if (!speOperator) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (speOperator._count.provisioningOrders > 0) {
      return NextResponse.json({ error: 'This SPE operator is still referenced and cannot be deleted' }, { status: 409 });
    }

    await prisma.speOperator.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Failed to delete SPE operator', e);
    const message = e instanceof Error ? e.message : 'Failed to delete SPE operator';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
