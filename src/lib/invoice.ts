import type { FinancialLineItem, InvoiceRecipientType } from '@prisma/client';

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
