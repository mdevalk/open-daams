import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { updateInvoiceStatus } from '@/lib/capabilities/fee-invoicing/invoice';

/**
 * PATCH /api/permits/[id]/invoices/[invoiceId]
 * body: { action: 'mark_paid' | 'cancel' }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; invoiceId: string }> },
) {
  try {
    const { id, invoiceId } = await params;
    const body = await req.json();

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (invoice?.permitId !== id) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    return await updateInvoiceStatus(invoice, body.action);
  } catch (e) {
    console.error('Failed to update invoice', e);
    const message = e instanceof Error ? e.message : 'Failed to update invoice';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
