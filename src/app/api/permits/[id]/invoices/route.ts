import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { buildInvoiceLineItems, calculateDueDate, nextInvoiceNumber, sumLineItems } from '@/lib/invoice';

/**
 * GET  /api/permits/[id]/invoices  — list invoices for a permit
 * POST /api/permits/[id]/invoices  — issue a new invoice, snapshotting the
 *                                    permit's current fee breakdown
 *                                    (EHDS Art. 62 / TEHDAS2 D6.3 Ch. 8)
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoices = await prisma.invoice.findMany({
    where: { permitId: id },
    include: { createdBy: { select: { name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(invoices);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const authz = await requireRole(body.userId, ['DECISION_MAKER', 'ADMIN']);
    if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status });

    const permit = await prisma.dataPermit.findUnique({ where: { id } });
    if (!permit) return NextResponse.json({ error: 'Permit not found' }, { status: 404 });

    const lineItems = buildInvoiceLineItems(permit);
    if (lineItems.length === 0) {
      return NextResponse.json(
        { error: 'This permit has no fee amounts recorded to invoice' },
        { status: 422 },
      );
    }

    const totalAmount = sumLineItems(lineItems);
    const now = new Date();
    const dueAt = calculateDueDate(now, typeof body.paymentTermDays === 'number' ? body.paymentTermDays : undefined);

    const count = await prisma.invoice.count();
    const invoiceNumber = nextInvoiceNumber(count + 1);

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        permitId: id,
        currency: permit.currency,
        lineItems,
        totalAmount,
        status: 'ISSUED',
        issuedAt: now,
        dueAt,
        notes: body.notes ?? null,
        createdById: authz.user.id,
      },
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (e) {
    console.error('Failed to issue invoice', e);
    const message = e instanceof Error ? e.message : 'Failed to issue invoice';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
