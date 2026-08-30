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

/**
 * POST /api/contacts
 * Create a contact for a masterdata owner (ADMIN-only).
 * body: { ownerType: 'DataUser'|'DataHolder'|'SpeOperator'|'SpeProvider', ownerId,
 *         name?, email?, phone?, role? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const auth = await requireRole(await actingUserId(), ['ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const ownerType = body.ownerType as OwnerType;
    if (typeof ownerType !== 'string' || !Object.hasOwn(OWNER_FIELD, ownerType) || !body.ownerId) {
      return NextResponse.json({ error: 'ownerType and ownerId are required' }, { status: 422 });
    }
    if (!body.name && !body.email) {
      return NextResponse.json({ error: 'At least a name or email is required' }, { status: 422 });
    }

    const contact = await prisma.contact.create({
      data: {
        [OWNER_FIELD[ownerType]]: body.ownerId,
        name: body.name || null,
        email: body.email || null,
        phone: body.phone || null,
        role: body.role || null,
      },
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
        action: `Contact created: ${contact.name || contact.email}`,
      },
    });

    return NextResponse.json(contact, { status: 201 });
  } catch (e) {
    console.error('Failed to create contact', e);
    const message = e instanceof Error ? e.message : 'Failed to create contact';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
