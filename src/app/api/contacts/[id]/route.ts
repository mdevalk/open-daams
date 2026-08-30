import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { actingUserId } from '@/auth';

const OWNER_FIELD = {
  DataUser: 'dataUserId',
  DataHolder: 'dataHolderId',
  SpeOperator: 'speOperatorId',
  SpeProvider: 'speProviderId',
} as const;
type OwnerType = keyof typeof OWNER_FIELD;
const OWNER_FIELDS = Object.values(OWNER_FIELD);

/** Builds the `data:` object for prisma.contact.update() from a PATCH body. */
export function buildContactUpdateData(body: Record<string, unknown>) {
  const ownerType = body.ownerType as OwnerType | undefined;
  const reassignOwner = typeof ownerType === 'string' && Object.hasOwn(OWNER_FIELD, ownerType) && body.ownerId;

  return {
    ...(body.name !== undefined ? { name: body.name || null } : {}),
    ...(body.email !== undefined ? { email: body.email || null } : {}),
    ...(body.phone !== undefined ? { phone: body.phone || null } : {}),
    ...(body.role !== undefined ? { role: body.role || null } : {}),
    // Exactly one owner FK is ever set — mirrors the invariant POST /api/contacts
    // establishes at creation. Only touched when the caller is actually
    // reassigning the contact's owner, not on a plain field edit.
    ...(reassignOwner
      ? Object.fromEntries(OWNER_FIELDS.map((f) => [f, f === OWNER_FIELD[ownerType] ? body.ownerId : null]))
      : {}),
  };
}

/**
 * PATCH /api/contacts/[id]
 * Update a contact's name/email/phone/role, and/or reassign its owner
 * (ADMIN-only).
 * body: { name?, email?, phone?, role?, ownerType?, ownerId? }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const auth = await requireRole(await actingUserId(), ['ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const contact = await prisma.contact.update({
      where: { id },
      data: buildContactUpdateData(body),
      include: {
        dataUser: { select: { name: true } },
        dataHolder: { select: { name: true } },
        speOperator: { select: { name: true } },
        speProvider: { select: { name: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        entityType: 'Contact',
        entityId: contact.id,
        action: `Contact updated: ${contact.name || contact.email}`,
      },
    });

    return NextResponse.json(contact);
  } catch (e) {
    console.error('Failed to update contact', e);
    const message = e instanceof Error ? e.message : 'Failed to update contact';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/contacts/[id]
 * Remove a contact (ADMIN-only). No referential-integrity blockers — Contact
 * isn't referenced elsewhere (see its schema comment: deliberately no live FK
 * from other tables into it).
 * (no request body needed)
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const auth = await requireRole(await actingUserId(), ['ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const contact = await prisma.contact.findUnique({ where: { id } });
    if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.contact.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        entityType: 'Contact',
        entityId: id,
        action: `Contact deleted: ${contact.name || contact.email}`,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Failed to delete contact', e);
    const message = e instanceof Error ? e.message : 'Failed to delete contact';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
