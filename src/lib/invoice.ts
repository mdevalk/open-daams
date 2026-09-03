import type { FinancialLineItem, Invoice, InvoiceRecipientType, InvoiceStatus, Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { actingUserId } from '@/auth';

export type SourceLineItem = Pick<
  FinancialLineItem,
  'category' | 'glCode' | 'description' | 'amount' | 'currency' | 'applicationId' | 'dataHolderId'
>;

// Snapshots a source's current line items (a FeeEstimate's or DataPermit's,
// already filtered to whichever subset this invoice covers) into fresh
// create-input rows for a new invoice-owned copy — invoices are a
// point-in-time record, so amounts must never retroactively change if the
// source is edited later.
export function snapshotLineItems(source: SourceLineItem[]) {
  return source.map(({ category, glCode, description, amount, currency, applicationId, dataHolderId }) => ({
    category,
    glCode,
    description,
    amount,
    currency,
    applicationId,
    dataHolderId,
  }));
}

// Groups a permit's DATA_HOLDER-category line items by dataHolderId, so
// invoice issuance can create one self-billing invoice per data holder
// actually involved. Items with no dataHolderId set are dropped — there's no
// recipient to bill them to.
export function groupByDataHolder<T extends Pick<SourceLineItem, 'category' | 'dataHolderId'>>(
  items: T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    if (item.category !== 'DATA_HOLDER' || !item.dataHolderId) continue;
    const existing = groups.get(item.dataHolderId);
    if (existing) existing.push(item);
    else groups.set(item.dataHolderId, [item]);
  }
  return groups;
}

export type OutstandingInvoiceGroup<T> =
  | { recipientType: 'APPLICANT'; items: T[] }
  | { recipientType: 'DATA_HOLDER'; dataHolderId: string; items: T[] }
  | { recipientType: 'SPE_OPERATOR'; speOperatorId: string; items: T[] };

// The single source of truth for "what's still invoiceable on this permit" —
// used both to decide whether the Issue invoices button should be enabled
// and, in the route, to actually build each invoice. Kept pure (no DB calls)
// so the two call sites can never disagree: the applicant invoice covers
// every category (unchanged, full total), self-billing invoices cover the
// data holder(s)' and SPE operator's own cost shares as additional
// accounting, not a subset of the applicant total. Each recipient is
// returned at most once per call — already-invoiced recipients are excluded
// via existingInvoices.
export function determineOutstandingInvoiceGroups<T extends Pick<SourceLineItem, 'category' | 'dataHolderId'>>(params: {
  lineItems: T[];
  existingInvoices: { recipientType: InvoiceRecipientType; dataHolderId: string | null }[];
  speOperatorId: string | null;
}): OutstandingInvoiceGroup<T>[] {
  const groups: OutstandingInvoiceGroup<T>[] = [];

  const hasApplicantInvoice = params.existingInvoices.some((inv) => inv.recipientType === 'APPLICANT');
  if (!hasApplicantInvoice && params.lineItems.length > 0) {
    groups.push({ recipientType: 'APPLICANT', items: params.lineItems });
  }

  const billedHolderIds = new Set(
    params.existingInvoices.filter((inv) => inv.recipientType === 'DATA_HOLDER').map((inv) => inv.dataHolderId),
  );
  for (const [dataHolderId, items] of groupByDataHolder(params.lineItems)) {
    if (!billedHolderIds.has(dataHolderId)) groups.push({ recipientType: 'DATA_HOLDER', dataHolderId, items });
  }

  const speItems = params.lineItems.filter((li) => li.category === 'SPE_SETUP' || li.category === 'SPE_USAGE');
  const hasSpeInvoice = params.existingInvoices.some((inv) => inv.recipientType === 'SPE_OPERATOR');
  if (!hasSpeInvoice && speItems.length > 0 && params.speOperatorId) {
    groups.push({ recipientType: 'SPE_OPERATOR', speOperatorId: params.speOperatorId, items: speItems });
  }

  return groups;
}

export function sumLineItems(items: Pick<FinancialLineItem, 'amount'>[]): number {
  return items.reduce((sum, item) => sum + Number(item.amount), 0);
}

const DEFAULT_PAYMENT_TERM_DAYS = 30;

export function calculateDueDate(from: Date, days = DEFAULT_PAYMENT_TERM_DAYS): Date {
  const due = new Date(from);
  due.setDate(due.getDate() + days);
  return due;
}

export function nextInvoiceNumber(sequence: number, prefix = 'INV-NL'): string {
  return `${prefix}-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
}

type InvoiceGroupRef = {
  referenceNumber: string | null;
  title: string | null;
  applicant: { name: string } | null;
};

type InvoiceGroupInput = {
  permit: { id: string; application: InvoiceGroupRef | null } | null;
  application: ({ id: string } & InvoiceGroupRef) | null;
};

// Groups invoices issued together — a permit's "Issue invoices" click can
// produce one applicant invoice plus one self-billing invoice per data
// holder/SPE operator, and those belong together visually. Grouped by
// permitId when set, falling back to applicationId for provisional
// (pre-permit) invoices, which are always solo. Callers should pass an
// already createdAt-desc-sorted list — iterating that order into a Map
// preserves "most recently active permit first" group ordering for free.
export function groupInvoicesByPermitOrApplication<T extends InvoiceGroupInput>(
  invoices: T[],
): { key: string; permit: T['permit']; reference: string; invoices: T[] }[] {
  const groupsMap = new Map<string, { key: string; permit: T['permit']; reference: string; invoices: T[] }>();
  for (const invoice of invoices) {
    const key = invoice.permit ? `permit-${invoice.permit.id}` : `application-${invoice.application?.id}`;
    let group = groupsMap.get(key);
    if (!group) {
      const applicant = invoice.permit?.application?.applicant ?? invoice.application?.applicant;
      const reference = invoice.permit
        ? `${invoice.permit.application?.referenceNumber} — ${invoice.permit.application?.title}`
        : `${invoice.application?.referenceNumber} — ${invoice.application?.title}`;
      group = { key, permit: invoice.permit, reference: `${applicant?.name ?? '—'} — ${reference}`, invoices: [] };
      groupsMap.set(key, group);
    }
    group.invoices.push(invoice);
  }
  return [...groupsMap.values()];
}

export function buildInvoiceWhereClause(params: {
  status?: string;
  overdue?: string;
  permitId?: string;
}): Prisma.InvoiceWhereInput {
  return {
    ...(params.status ? { status: params.status as InvoiceStatus } : {}),
    ...(params.overdue ? { status: 'ISSUED' as const, dueAt: { lt: new Date() } } : {}),
    ...(params.permitId ? { permitId: params.permitId } : {}),
  };
}

export function buildInvoiceStatusCounts(counts: { status: string; _count: number }[]): Record<string, number> {
  const countMap: Record<string, number> = {};
  counts.forEach((c) => { countMap[c.status] = c._count; });
  return countMap;
}

export function buildInvoiceStatusSums(
  totals: { status: string; _sum: { totalAmount: Prisma.Decimal | null } }[],
): Record<string, number> {
  const sumByStatus: Record<string, number> = {};
  totals.forEach((s) => { sumByStatus[s.status] = Number(s._sum.totalAmount ?? 0); });
  return sumByStatus;
}

export function resolveActiveTab(rawTab: string | undefined): 'estimates' | 'invoices' {
  return rawTab === 'invoices' ? 'invoices' : 'estimates';
}

// Shared PATCH handler for /invoices/[invoiceId] and
// /permits/[id]/invoices/[invoiceId] — same two actions, differing only in
// how the caller looks up + scopes the invoice beforehand.
export async function updateInvoiceStatus(invoice: Invoice, action: unknown): Promise<NextResponse> {
  if (action === 'mark_paid') {
    const authz = await requireRole(await actingUserId(), ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN']);
    if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status });
    if (invoice.status !== 'ISSUED') {
      return NextResponse.json({ error: `Cannot mark a ${invoice.status} invoice as paid` }, { status: 422 });
    }
    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'PAID', paidAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        userId: authz.user.id,
        entityType: 'Invoice',
        entityId: invoice.id,
        action: `Invoice marked paid: ${invoice.invoiceNumber}`,
        comment: null,
      },
    });
    return NextResponse.json(updated);
  }

  if (action === 'cancel') {
    const authz = await requireRole(await actingUserId(), ['DECISION_MAKER', 'ADMIN']);
    if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status });
    if (invoice.status === 'PAID') {
      return NextResponse.json({ error: 'Cannot cancel a paid invoice' }, { status: 422 });
    }
    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'CANCELLED' },
    });
    await prisma.auditLog.create({
      data: {
        userId: authz.user.id,
        entityType: 'Invoice',
        entityId: invoice.id,
        action: `Invoice cancelled: ${invoice.invoiceNumber}`,
        comment: null,
      },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
