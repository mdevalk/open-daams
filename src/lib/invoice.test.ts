import { describe, it, expect } from 'vitest';
import type { DataPermit, FeeEstimate } from '@prisma/client';
import {
  buildInvoiceLineItems,
  buildProvisionalInvoiceLineItems,
  sumLineItems,
  calculateDueDate,
  nextInvoiceNumber,
} from '@/lib/invoice';

describe('buildInvoiceLineItems', () => {
  it('includes only the fee fields that are set', () => {
    const permit = {
      permitProcessingFee: 100,
      dataPreparationFee: null,
      speSetupFee: 250.5,
      speUsageFee: null,
      additionalServicesFee: null,
      dataHolderFee: null,
    } as unknown as DataPermit;

    expect(buildInvoiceLineItems(permit)).toEqual([
      { description: 'Permit processing fee', amount: '100' },
      { description: 'Secure processing environment — setup fee', amount: '250.5' },
    ]);
  });

  it('returns no line items when no fees are set', () => {
    const permit = {
      permitProcessingFee: null,
      dataPreparationFee: null,
      speSetupFee: null,
      speUsageFee: null,
      additionalServicesFee: null,
      dataHolderFee: null,
    } as unknown as DataPermit;

    expect(buildInvoiceLineItems(permit)).toEqual([]);
  });
});

describe('buildProvisionalInvoiceLineItems', () => {
  it('only considers the narrower fee-estimate fee set', () => {
    const estimate = {
      administrativeFee: 50,
      dataPreparationFee: 75,
      dataHolderFee: null,
    } as unknown as FeeEstimate;

    expect(buildProvisionalInvoiceLineItems(estimate)).toEqual([
      { description: 'Administrative / processing fee', amount: '50' },
      { description: 'Data preparation fee', amount: '75' },
    ]);
  });
});

describe('sumLineItems', () => {
  it('sums the amounts across line items', () => {
    expect(
      sumLineItems([
        { description: 'a', amount: '100' },
        { description: 'b', amount: '250.5' },
      ]),
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
