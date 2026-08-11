import { describe, it, expect } from 'vitest';
import { snapshotLineItems, sumLineItems, calculateDueDate, nextInvoiceNumber, type SourceLineItem } from '@/lib/invoice';

describe('snapshotLineItems', () => {
  it('copies category/glCode/description/amount/currency, dropping identity fields', () => {
    const source = [
      { category: 'ADMINISTRATIVE', glCode: '4010', description: null, amount: 100, currency: 'EUR' },
      { category: 'SPE_SETUP', glCode: '4040', description: null, amount: 250.5, currency: 'EUR' },
    ] as unknown as SourceLineItem[];

    expect(snapshotLineItems(source)).toEqual([
      { category: 'ADMINISTRATIVE', glCode: '4010', description: null, amount: 100, currency: 'EUR' },
      { category: 'SPE_SETUP', glCode: '4040', description: null, amount: 250.5, currency: 'EUR' },
    ]);
  });

  it('returns an empty array for no source items', () => {
    expect(snapshotLineItems([])).toEqual([]);
  });
});

describe('sumLineItems', () => {
  it('sums the amounts across line items', () => {
    expect(
      sumLineItems([{ amount: 100 }, { amount: 250.5 }] as unknown as SourceLineItem[]),
    ).toBe(350.5);
  });

  it('returns 0 for an empty list', () => {
    expect(sumLineItems([])).toBe(0);
  });
});

describe('calculateDueDate', () => {
  // setDate() operates in the local timezone, so fixtures use a local-time
  // Date constructor (not a UTC-midnight ISO string) to stay correct
  // regardless of the test runner's timezone.
  it('defaults to a 30-day payment term', () => {
    expect(calculateDueDate(new Date(2026, 0, 1))).toEqual(new Date(2026, 0, 31));
  });

  it('accepts a custom term', () => {
    expect(calculateDueDate(new Date(2026, 0, 1), 10)).toEqual(new Date(2026, 0, 11));
  });
});

describe('nextInvoiceNumber', () => {
  it('pads the sequence to 4 digits', () => {
    const year = new Date().getFullYear();
    expect(nextInvoiceNumber(7)).toBe(`INV-NL-${year}-0007`);
    expect(nextInvoiceNumber(1234)).toBe(`INV-NL-${year}-1234`);
  });
});
