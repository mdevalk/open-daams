import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { buildProvisionalInvoiceLineItems, calculateDueDate, nextInvoiceNumber, sumLineItems } from '@/lib/invoice';

/**
 * POST /api/applications/[id]/provisional-invoice
 *
 * Issues a provisional invoice from the application's accepted fee estimate
 * (EHDS Art. 62 / TEHDAS2 D6.3 Ch. 8), ahead of any permit being granted.
 * At most one provisional invoice may exist per fee estimate.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const authz = await requireRole(body.userId, ['DECISION_MAKER', 'ADMIN']);
    if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status });

    const feeEstimate = await prisma.feeEstimate.findUnique({
      where: { applicationId: id },
      include: { invoice: true },
    });
    if (!feeEstimate) return NextResponse.json({ error: 'No fee estimate found for this application' }, { status: 404 });
    if (feeEstimate.status !== 'ACCEPTED') {
      return NextResponse.json({ error: 'The fee estimate has not been accepted by the applicant yet' }, { status: 422 });
    }
    if (feeEstimate.invoice) {
      return NextResponse.json({ error: `A provisional invoice already exists: ${feeEstimate.invoice.invoiceNumber}` }, { status: 409 });
    }

    const lineItems = buildProvisionalInvoiceLineItems(feeEstimate);
    if (lineItems.length === 0) {
      return NextResponse.json({ error: 'The fee estimate has no fee amounts to invoice' }, { status: 422 });
    }

    const totalAmount = sumLineItems(lineItems);
    const now = new Date();
    const dueAt = calculateDueDate(now, typeof body.paymentTermDays === 'number' ? body.paymentTermDays : undefined);

    const count = await prisma.invoice.count();
    const invoiceNumber = nextInvoiceNumber(count + 1);

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        provisional: true,
        applicationId: id,
        feeEstimateId: feeEstimate.id,
        currency: feeEstimate.currency,
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
    console.error('Failed to issue provisional invoice', e);
    const message = e instanceof Error ? e.message : 'Failed to issue provisional invoice';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
