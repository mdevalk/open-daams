import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

/** Validates the setupFee/monthlyFee fields from a PATCH body; returns an error message, or null if valid. */
export function validateSpeTypeFees(body: Record<string, unknown>): string | null {
  if (body.setupFee !== undefined && !Number.isFinite(Number(body.setupFee as string | number))) {
    return 'setupFee must be a number';
  }
  if (body.monthlyFee !== undefined && !Number.isFinite(Number(body.monthlyFee as string | number))) {
    return 'monthlyFee must be a number';
  }
  return null;
}

/** Builds the `data:` object for prisma.speType.update() from a PATCH body. */
export function buildSpeTypeUpdateData(body: Record<string, unknown>) {
  return {
    ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
    ...(body.setupFee !== undefined ? { setupFee: Number(body.setupFee as string | number) } : {}),
    ...(body.monthlyFee !== undefined ? { monthlyFee: Number(body.monthlyFee as string | number) } : {}),
  };
}

/** Builds the human-readable audit-log `changes` list from a PATCH body. */
export function describeSpeTypeChanges(body: Record<string, unknown>): string[] {
  const changes: string[] = [];
  if (body.name !== undefined) changes.push('name');
  if (body.setupFee !== undefined) changes.push('setup fee');
  if (body.monthlyFee !== undefined) changes.push('monthly fee');
  return changes;
}

/**
 * PATCH /api/spe-types/[id]
 * Update an SPE type's name/fees (ADMIN-only).
 * body: { name?, setupFee?, monthlyFee?, actingUserId }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const auth = await requireRole(body.actingUserId, ['ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const feeError = validateSpeTypeFees(body);
    if (feeError) return NextResponse.json({ error: feeError }, { status: 422 });

    const type = await prisma.speType.update({
      where: { id },
      data: buildSpeTypeUpdateData(body),
      include: { speOperator: { select: { name: true } } },
    });

    const changes = describeSpeTypeChanges(body);

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        entityType: 'SpeType',
        entityId: type.id,
        action: `SPE type updated: ${type.name} (${type.speOperator.name})`,
        comment: changes.length > 0 ? changes.join(', ') : null,
      },
    });

    return NextResponse.json(type);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'This operator already has a type with that name' }, { status: 409 });
    }
    console.error('Failed to update SPE type', e);
    const message = e instanceof Error ? e.message : 'Failed to update SPE type';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/spe-types/[id]
 * Remove an SPE type (ADMIN-only). Permits that already reference it keep
 * their speTypeId (FK is not restrict — historical record stays
 * intact) but it disappears from the picker for future issuances.
 * body: { actingUserId }
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const auth = await requireRole(body.actingUserId, ['ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const type = await prisma.speType.findUnique({
      where: { id },
      include: { speOperator: { select: { name: true } } },
    });
    if (!type) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.speType.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        entityType: 'SpeType',
        entityId: id,
        action: `SPE type deleted: ${type.name} (${type.speOperator.name})`,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Failed to delete SPE type', e);
    const message = e instanceof Error ? e.message : 'Failed to delete SPE type';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
