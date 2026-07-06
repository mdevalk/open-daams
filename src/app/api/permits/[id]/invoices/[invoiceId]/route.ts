import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

/**
 * PATCH /api/permits/[id]/invoices/[invoiceId]
 * body: { userId, action: 'mark_paid' | 'cancel' }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; invoiceId: string }> },
) {
  try {
    const { id, invoiceId } = await params;
    const body = await req.json();

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice || invoice.permitId !== id) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (body.action === 'mark_paid') {
      const authz = await requireRole(body.userId, ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN']);
      if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status });
      if (invoice.status !== 'ISSUED') {
        return NextResponse.json({ error: `Cannot mark a ${invoice.status} invoice as paid` }, { status: 422 });
      }
      const updated = await prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: 'PAID', paidAt: new Date() },
      });
      return NextResponse.json(updated);
    }

    if (body.action === 'cancel') {
      const authz = await requireRole(body.userId, ['DECISION_MAKER', 'ADMIN']);
      if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status });
      if (invoice.status === 'PAID') {
        return NextResponse.json({ error: 'Cannot cancel a paid invoice' }, { status: 422 });
      }
      const updated = await prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: 'CANCELLED' },
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('Failed to update invoice', e);
    const message = e instanceof Error ? e.message : 'Failed to update invoice';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
