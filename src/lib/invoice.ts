import type { FinancialLineItem } from '@prisma/client';

export type SourceLineItem = Pick<FinancialLineItem, 'category' | 'glCode' | 'description' | 'amount' | 'currency'>;

// Snapshots a source's current line items (a FeeEstimate's or DataPermit's)
// into fresh create-input rows for a new invoice-owned copy — invoices are a
// point-in-time record, so amounts must never retroactively change if the
// source is edited later.
export function snapshotLineItems(source: SourceLineItem[]) {
  return source.map(({ category, glCode, description, amount, currency }) => ({
    category,
    glCode,
    description,
    amount,
    currency,
  }));
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

export function nextInvoiceNumber(sequence: number): string {
  return `INV-NL-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
}
