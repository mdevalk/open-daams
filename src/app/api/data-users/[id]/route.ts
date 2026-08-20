import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

/**
 * PATCH /api/data-users/[id]
 * Update a data user's masterdata (ADMIN-only).
 * body: { name?, contactEmail?, contactPhone?, actingUserId }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const auth = await requireRole(body.actingUserId, ['ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (body.contactEmail !== undefined || body.contactPhone !== undefined) {
      const existingContact = await prisma.contact.findFirst({ where: { dataUserId: id, role: 'PRIMARY' } });
      const contactData = {
        ...(body.contactEmail !== undefined ? { email: body.contactEmail || null } : {}),
        ...(body.contactPhone !== undefined ? { phone: body.contactPhone || null } : {}),
      };
      if (existingContact) {
        await prisma.contact.update({ where: { id: existingContact.id }, data: contactData });
      } else {
        await prisma.contact.create({ data: { dataUserId: id, role: 'PRIMARY', ...contactData } });
      }
    }

    const dataUser = await prisma.dataUser.update({
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
        entityType: 'DataUser',
        entityId: dataUser.id,
        action: `Data user updated: ${dataUser.name}`,
        comment: changes.length > 0 ? changes.join(', ') : null,
      },
    });

    return NextResponse.json(dataUser);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'A data user with this name already exists' }, { status: 409 });
    }
    console.error('Failed to update data user', e);
    const message = e instanceof Error ? e.message : 'Failed to update data user';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/data-users/[id]
 * Remove a data user (ADMIN-only). Blocked with 409 if still referenced by
 * any User.
 * body: { actingUserId }
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const auth = await requireRole(body.actingUserId, ['ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const dataUser = await prisma.dataUser.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!dataUser) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (dataUser._count.users > 0) {
      return NextResponse.json({ error: 'This data user is still referenced and cannot be deleted' }, { status: 409 });
    }

    await prisma.dataUser.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        entityType: 'DataUser',
        entityId: id,
        action: `Data user deleted: ${dataUser.name}`,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Failed to delete data user', e);
    const message = e instanceof Error ? e.message : 'Failed to delete data user';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
