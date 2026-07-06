import { DataPermit } from '@prisma/client';

// EHDS Art. 62 / TEHDAS2 D6.3 Ch. 8 — fee transparency: invoices must break
// down the individual cost components that make up the total.
const FEE_LINE_DEFS: Array<{ key: keyof DataPermit; description: string }> = [
  { key: 'permitProcessingFee', description: 'Permit processing fee' },
  { key: 'dataPreparationFee', description: 'Data preparation fee' },
  { key: 'speSetupFee', description: 'Secure processing environment — setup fee' },
  { key: 'speUsageFee', description: 'Secure processing environment — usage fee' },
  { key: 'additionalServicesFee', description: 'Additional services fee' },
  { key: 'dataHolderFee', description: 'Data holder fee(s)' },
];

export type InvoiceLineItem = { description: string; amount: string };

export function buildInvoiceLineItems(permit: DataPermit): InvoiceLineItem[] {
  return FEE_LINE_DEFS.filter(({ key }) => permit[key] != null).map(({ key, description }) => ({
    description,
    amount: (permit[key] as { toString(): string }).toString(),
  }));
}

export function sumLineItems(items: InvoiceLineItem[]): number {
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
