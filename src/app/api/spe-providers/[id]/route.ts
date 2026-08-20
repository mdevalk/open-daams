import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

/**
 * PATCH /api/spe-providers/[id]
 * Update an SPE provider's masterdata (ADMIN-only).
 * body: { name?, contactEmail?, contactPhone?, actingUserId }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const auth = await requireRole(body.actingUserId, ['ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (body.contactEmail !== undefined || body.contactPhone !== undefined) {
      const existingContact = await prisma.contact.findFirst({ where: { speProviderId: id, role: 'PRIMARY' } });
      const contactData = {
        ...(body.contactEmail !== undefined ? { email: body.contactEmail || null } : {}),
        ...(body.contactPhone !== undefined ? { phone: body.contactPhone || null } : {}),
      };
      if (existingContact) {
        await prisma.contact.update({ where: { id: existingContact.id }, data: contactData });
      } else {
        await prisma.contact.create({ data: { speProviderId: id, role: 'PRIMARY', ...contactData } });
      }
    }

    const speProvider = await prisma.speProvider.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
      },
      include: { contacts: true },
    });

    const changes: string[] = [];
    if (body.name !== undefined) changes.push('name');
    if (body.contactEmail !== undefined) changes.push('contact email');
    if (body.contactPhone !== undefined) changes.push('contact phone');

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        entityType: 'SpeProvider',
        entityId: speProvider.id,
        action: `SPE provider updated: ${speProvider.name}`,
        comment: changes.length > 0 ? changes.join(', ') : null,
      },
    });

    return NextResponse.json(speProvider);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'An SPE provider with this name already exists' }, { status: 409 });
    }
    console.error('Failed to update SPE provider', e);
    const message = e instanceof Error ? e.message : 'Failed to update SPE provider';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/spe-providers/[id]
 * Remove an SPE provider (ADMIN-only). Blocked with 409 if still referenced
 * by any SPE operator.
 * body: { actingUserId }
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const auth = await requireRole(body.actingUserId, ['ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const speProvider = await prisma.speProvider.findUnique({
      where: { id },
      include: { _count: { select: { operators: true } } },
    });
    if (!speProvider) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (speProvider._count.operators > 0) {
      return NextResponse.json({ error: 'This SPE provider is still referenced and cannot be deleted' }, { status: 409 });
    }

    await prisma.speProvider.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        entityType: 'SpeProvider',
        entityId: id,
        action: `SPE provider deleted: ${speProvider.name}`,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Failed to delete SPE provider', e);
    const message = e instanceof Error ? e.message : 'Failed to delete SPE provider';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
