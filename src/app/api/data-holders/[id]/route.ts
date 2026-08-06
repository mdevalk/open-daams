import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

/**
 * PATCH /api/data-holders/[id]
 * Update a data holder's masterdata (ADMIN-only).
 * body: { name?, contactEmail?, contactPhone?, isTrusted?, actingUserId }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const auth = await requireRole(body.actingUserId, ['ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const dataHolder = await prisma.dataHolder.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
        ...(body.contactEmail !== undefined ? { contactEmail: body.contactEmail || null } : {}),
        ...(body.contactPhone !== undefined ? { contactPhone: body.contactPhone || null } : {}),
        ...(body.isTrusted !== undefined ? { isTrusted: Boolean(body.isTrusted) } : {}),
      },
    });

    return NextResponse.json(dataHolder);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'A data holder with this name already exists' }, { status: 409 });
    }
    console.error('Failed to update data holder', e);
    const message = e instanceof Error ? e.message : 'Failed to update data holder';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/data-holders/[id]
 * Remove a data holder (ADMIN-only). Blocked with 409 if still referenced by
 * any requested/granted dataset or extraction request.
 * body: { actingUserId }
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const auth = await requireRole(body.actingUserId, ['ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const dataHolder = await prisma.dataHolder.findUnique({
      where: { id },
      include: {
        _count: { select: { requestedDatasets: true, grantedDatasets: true, extractionRequests: true } },
      },
    });
    if (!dataHolder) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (Object.values(dataHolder._count).some((c) => c > 0)) {
      return NextResponse.json({ error: 'This data holder is still referenced and cannot be deleted' }, { status: 409 });
    }

    await prisma.dataHolder.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Failed to delete data holder', e);
    const message = e instanceof Error ? e.message : 'Failed to delete data holder';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
