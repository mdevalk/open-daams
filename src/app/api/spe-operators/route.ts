import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

/**
 * GET /api/spe-operators
 * List all registered SPE operators (with their linked provider, if any) —
 * no auth, so the SpeProvisioningPanel dropdown works for any role.
 */
export async function GET() {
  const speOperators = await prisma.speOperator.findMany({
    include: { speProvider: { select: { name: true } }, contacts: true },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json(speOperators);
}

/**
 * POST /api/spe-operators
 * Register a new SPE operator (Masterdata, ADMIN-only).
 * body: { name, contactEmail?, contactPhone?, speProviderId?, address?, businessId?, vatNumber?,
 *         invoiceType?, invoiceReferenceNumber?, eInvoiceAddress?, operatorId?, peppolCode?,
 *         actingUserId }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const auth = await requireRole(body.actingUserId, ['ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 422 });
    }

    const speOperator = await prisma.speOperator.create({
      data: {
        name: String(body.name).trim(),
        speProviderId: body.speProviderId || null,
        address: body.address || null,
        businessId: body.businessId || null,
        vatNumber: body.vatNumber || null,
        invoiceType: body.invoiceType || null,
        invoiceReferenceNumber: body.invoiceReferenceNumber || null,
        eInvoiceAddress: body.eInvoiceAddress || null,
        operatorId: body.operatorId || null,
        peppolCode: body.peppolCode || null,
        ...(body.contactEmail || body.contactPhone
          ? { contacts: { create: { email: body.contactEmail || null, phone: body.contactPhone || null, role: 'PRIMARY' } } }
          : {}),
      },
      include: { contacts: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        entityType: 'SpeOperator',
        entityId: speOperator.id,
        action: `SPE operator created: ${speOperator.name}`,
      },
    });

    return NextResponse.json(speOperator, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'An SPE operator with this name already exists' }, { status: 409 });
    }
    console.error('Failed to create SPE operator', e);
    const message = e instanceof Error ? e.message : 'Failed to create SPE operator';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
