import { describe, it, expect } from 'vitest';
import {
  snapshotLineItems,
  sumLineItems,
  calculateDueDate,
  nextInvoiceNumber,
  groupByDataHolder,
  determineOutstandingInvoiceGroups,
  type SourceLineItem,
} from '@/lib/invoice';

describe('snapshotLineItems', () => {
  it('copies category/glCode/description/amount/currency/applicationId/dataHolderId, dropping identity fields', () => {
    const source = [
      { category: 'ADMINISTRATIVE', glCode: '4010', description: null, amount: 100, currency: 'EUR', applicationId: 'app1', dataHolderId: null },
      { category: 'DATA_HOLDER', glCode: '4030', description: null, amount: 250.5, currency: 'EUR', applicationId: 'app1', dataHolderId: 'dh1' },
    ] as unknown as SourceLineItem[];

    expect(snapshotLineItems(source)).toEqual([
      { category: 'ADMINISTRATIVE', glCode: '4010', description: null, amount: 100, currency: 'EUR', applicationId: 'app1', dataHolderId: null },
      { category: 'DATA_HOLDER', glCode: '4030', description: null, amount: 250.5, currency: 'EUR', applicationId: 'app1', dataHolderId: 'dh1' },
    ]);
  });

  it('returns an empty array for no source items', () => {
    expect(snapshotLineItems([])).toEqual([]);
  });
});

describe('groupByDataHolder', () => {
  it('groups DATA_HOLDER-category items by dataHolderId', () => {
    const items = [
      { category: 'DATA_HOLDER', dataHolderId: 'dh1', amount: 100 },
      { category: 'DATA_HOLDER', dataHolderId: 'dh2', amount: 50 },
      { category: 'DATA_HOLDER', dataHolderId: 'dh1', amount: 25 },
    ] as unknown as SourceLineItem[];

    const groups = groupByDataHolder(items);
    expect(groups.size).toBe(2);
    expect(groups.get('dh1')).toHaveLength(2);
    expect(groups.get('dh2')).toHaveLength(1);
  });

  it('drops non-DATA_HOLDER items and items with no dataHolderId', () => {
    const items = [
      { category: 'ADMINISTRATIVE', dataHolderId: null, amount: 100 },
      { category: 'DATA_HOLDER', dataHolderId: null, amount: 50 },
    ] as unknown as SourceLineItem[];

    expect(groupByDataHolder(items).size).toBe(0);
  });
});

describe('determineOutstandingInvoiceGroups', () => {
  const applicantItem = { category: 'ADMINISTRATIVE', dataHolderId: null } as unknown as SourceLineItem;
  const holder1Item = { category: 'DATA_HOLDER', dataHolderId: 'dh1' } as unknown as SourceLineItem;
  const holder2Item = { category: 'DATA_HOLDER', dataHolderId: 'dh2' } as unknown as SourceLineItem;
  const speItem = { category: 'SPE_SETUP', dataHolderId: null } as unknown as SourceLineItem;

  it('returns an applicant, one group per data holder, and an SPE group when nothing is billed yet', () => {
    const groups = determineOutstandingInvoiceGroups({
      lineItems: [applicantItem, holder1Item, holder2Item, speItem],
      existingInvoices: [],
      speOperatorId: 'op1',
    });

    expect(groups).toEqual([
      { recipientType: 'APPLICANT', items: [applicantItem, holder1Item, holder2Item, speItem] },
      { recipientType: 'DATA_HOLDER', dataHolderId: 'dh1', items: [holder1Item] },
      { recipientType: 'DATA_HOLDER', dataHolderId: 'dh2', items: [holder2Item] },
      { recipientType: 'SPE_OPERATOR', speOperatorId: 'op1', items: [speItem] },
    ]);
  });

  it('excludes the applicant group once an applicant invoice already exists', () => {
    const groups = determineOutstandingInvoiceGroups({
      lineItems: [applicantItem, holder1Item],
      existingInvoices: [{ recipientType: 'APPLICANT', dataHolderId: null }],
      speOperatorId: null,
    });

    expect(groups.map((g) => g.recipientType)).toEqual(['DATA_HOLDER']);
  });

  it('excludes only the data holder that already has an invoice', () => {
    const groups = determineOutstandingInvoiceGroups({
      lineItems: [holder1Item, holder2Item],
      existingInvoices: [{ recipientType: 'DATA_HOLDER', dataHolderId: 'dh1' }],
      speOperatorId: null,
    });

    expect(groups).toEqual([
      { recipientType: 'APPLICANT', items: [holder1Item, holder2Item] },
      { recipientType: 'DATA_HOLDER', dataHolderId: 'dh2', items: [holder2Item] },
    ]);
  });

  it('does not create an SPE group when no SPE operator is designated', () => {
    const groups = determineOutstandingInvoiceGroups({
      lineItems: [speItem],
      existingInvoices: [],
      speOperatorId: null,
    });

    expect(groups.some((g) => g.recipientType === 'SPE_OPERATOR')).toBe(false);
  });

  it('excludes the SPE group once an SPE invoice already exists', () => {
    const groups = determineOutstandingInvoiceGroups({
      lineItems: [speItem],
      existingInvoices: [{ recipientType: 'SPE_OPERATOR', dataHolderId: null }],
      speOperatorId: 'op1',
    });

    expect(groups.some((g) => g.recipientType === 'SPE_OPERATOR')).toBe(false);
  });

  it('returns nothing for an empty line-item list', () => {
    expect(
      determineOutstandingInvoiceGroups({ lineItems: [], existingInvoices: [], speOperatorId: 'op1' }),
    ).toEqual([]);
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

  it('accepts a custom prefix, for self-billing invoices', () => {
    const year = new Date().getFullYear();
    expect(nextInvoiceNumber(7, 'SBI-NL')).toBe(`SBI-NL-${year}-0007`);
  });
});
