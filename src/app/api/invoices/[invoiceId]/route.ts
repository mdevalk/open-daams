import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { updateInvoiceStatus } from '@/lib/invoice';

/**
 * PATCH /api/invoices/[invoiceId]
 * body: { action: 'mark_paid' | 'cancel' }
 *
 * Generic invoice status update, covering both provisional invoices
 * (issued from an accepted fee estimate, no permit yet) and final invoices
 * (issued from a granted permit's fee breakdown).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    const { invoiceId } = await params;
    const body = await req.json();

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    return await updateInvoiceStatus(invoice, body.action);
  } catch (e) {
    console.error('Failed to update invoice', e);
    const message = e instanceof Error ? e.message : 'Failed to update invoice';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
