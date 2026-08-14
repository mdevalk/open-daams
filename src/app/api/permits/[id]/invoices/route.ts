import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import {
  snapshotLineItems,
  calculateDueDate,
  nextInvoiceNumber,
  sumLineItems,
  determineOutstandingInvoiceGroups,
} from '@/lib/invoice';

/**
 * GET  /api/permits/[id]/invoices  — list invoices for a permit
 * POST /api/permits/[id]/invoices  — issue whichever invoices are still
 *                                    outstanding for this permit's current
 *                                    fee breakdown (EHDS Art. 62 / TEHDAS2
 *                                    D6.3 Ch. 8): one applicant invoice
 *                                    (the full total, unchanged) plus
 *                                    self-billing invoices for the data
 *                                    holder(s) and SPE operator's own cost
 *                                    shares — HDAB pays those out, they're
 *                                    additional accounting, not a subset of
 *                                    the applicant's total. Returns the
 *                                    invoices actually created (0–N); an
 *                                    empty array means nothing was left to
 *                                    invoice, not an error.
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

    const authz = await requireRole(body.actingUserId, ['DECISION_MAKER', 'ADMIN']);
    if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status });

    const permit = await prisma.dataPermit.findUnique({
      where: { id },
      include: { lineItems: true, invoices: { select: { recipientType: true, dataHolderId: true } } },
    });
    if (!permit) return NextResponse.json({ error: 'Permit not found' }, { status: 404 });

    const groups = determineOutstandingInvoiceGroups({
      lineItems: permit.lineItems,
      existingInvoices: permit.invoices,
      speOperatorId: permit.speOperatorId,
    });
    if (groups.length === 0) return NextResponse.json([], { status: 200 });

    // Data-holder names aren't frozen anywhere upstream (unlike the permit's
    // own speOperatorName), so look them up once here, at the moment each
    // self-billing invoice's recipientName gets frozen.
    const holderIds = groups.filter((g) => g.recipientType === 'DATA_HOLDER').map((g) => g.dataHolderId);
    const holders = holderIds.length > 0 ? await prisma.dataHolder.findMany({ where: { id: { in: holderIds } } }) : [];

    const now = new Date();
    const dueAt = calculateDueDate(now, typeof body.paymentTermDays === 'number' ? body.paymentTermDays : undefined);
    let sequence = await prisma.invoice.count();

    const created = await prisma.$transaction(async (tx) => {
      const invoices = [];
      for (const group of groups) {
        sequence += 1;
        const lineItems = snapshotLineItems(group.items);
        const totalAmount = sumLineItems(lineItems);
        const prefix = group.recipientType === 'APPLICANT' ? 'INV-NL' : 'SBI-NL';
        const recipientName =
          group.recipientType === 'DATA_HOLDER'
            ? holders.find((h) => h.id === group.dataHolderId)?.name ?? null
            : group.recipientType === 'SPE_OPERATOR'
              ? permit.speOperatorName
              : null;

        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber: nextInvoiceNumber(sequence, prefix),
            permitId: id,
            recipientType: group.recipientType,
            recipientName,
            dataHolderId: group.recipientType === 'DATA_HOLDER' ? group.dataHolderId : null,
            speOperatorId: group.recipientType === 'SPE_OPERATOR' ? group.speOperatorId : null,
            currency: permit.currency,
            lineItems: { create: lineItems },
            totalAmount,
            status: 'ISSUED',
            issuedAt: now,
            dueAt,
            notes: body.notes ?? null,
            createdById: authz.user.id,
          },
          include: { lineItems: true },
        });

        await tx.auditLog.create({
          data: {
            userId: authz.user.id,
            entityType: 'Invoice',
            entityId: invoice.id,
            action: `Invoice issued: ${invoice.invoiceNumber} (${invoice.currency} ${totalAmount})`,
            comment: null,
          },
        });

        invoices.push(invoice);
      }
      return invoices;
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error('Failed to issue invoices', e);
    const message = e instanceof Error ? e.message : 'Failed to issue invoices';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
