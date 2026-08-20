import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

/**
 * GET /api/data-holders
 * List all registered data holders — no auth, so the dropdowns that
 * reference this registry (NewApplicationForm, ExtractionRequestsPanel)
 * work for any role, matching the /api/users precedent.
 */
export async function GET() {
  const dataHolders = await prisma.dataHolder.findMany({ orderBy: { name: 'asc' }, include: { contacts: true } });
  return NextResponse.json(dataHolders);
}

/**
 * POST /api/data-holders
 * Register a new data holder (Masterdata, ADMIN-only).
 * body: { name, contactEmail?, contactPhone?, isTrusted?, address?, businessId?, vatNumber?,
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

    const dataHolder = await prisma.dataHolder.create({
      data: {
        name: String(body.name).trim(),
        isTrusted: Boolean(body.isTrusted),
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
        entityType: 'DataHolder',
        entityId: dataHolder.id,
        action: `Data holder created: ${dataHolder.name}`,
      },
    });

    return NextResponse.json(dataHolder, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'A data holder with this name already exists' }, { status: 409 });
    }
    console.error('Failed to create data holder', e);
    const message = e instanceof Error ? e.message : 'Failed to create data holder';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
