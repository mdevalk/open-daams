import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDate,
  formatDateNumeric,
  formatDateTime,
  daysUntil,
  serializePrisma,
  purposeLabel,
  cohortFormationLabel,
  extractionMethodLabel,
  extractionFrequencyLabel,
  extractionIntervalLabel,
} from '@/lib/utils';

describe('formatDate', () => {
  it('formats a date in the short nl-NL form', () => {
    // The exact abbreviated-month punctuation ("mrt" vs "mrt.") depends on the
    // ICU/CLDR data bundled with the Node version running the test, so match
    // loosely rather than pinning to one variant.
    expect(formatDate('2026-03-05')).toMatch(/^05 mrt\.? 2026$/);
  });

  it('returns an em dash for a missing date', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
  });
});

describe('formatDateNumeric', () => {
  it('formats a date as DD-MM-YYYY', () => {
    expect(formatDateNumeric('2026-03-05')).toBe('05-03-2026');
  });

  it('returns an em dash for a missing date', () => {
    expect(formatDateNumeric(null)).toBe('—');
  });
});

describe('formatDateTime', () => {
  it('includes hours and minutes', () => {
    expect(formatDateTime('2026-03-05T14:30:00Z')).toContain('2026');
  });

  it('returns an em dash for a missing date', () => {
    expect(formatDateTime(undefined)).toBe('—');
  });
});

describe('daysUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the number of whole days remaining', () => {
    expect(daysUntil(new Date('2026-01-08T00:00:00Z'))).toBe(7);
  });

  it('returns a negative number for a date in the past', () => {
    expect(daysUntil(new Date('2025-12-30T00:00:00Z'))).toBe(-2);
  });

  it('returns null when there is no date', () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil(undefined)).toBeNull();
  });
});

describe('serializePrisma', () => {
  it('round-trips a plain object unchanged', () => {
    expect(serializePrisma({ a: 1, b: 'x' })).toEqual({ a: 1, b: 'x' });
  });

  it('converts Date fields to ISO strings, matching the RSC prop boundary', () => {
    const date = new Date('2026-03-05T00:00:00Z');
    expect(serializePrisma({ date })).toEqual({ date: date.toISOString() });
  });
});

describe('label lookups', () => {
  it('purposeLabel maps a known code and falls back to the raw code otherwise', () => {
    expect(purposeLabel('SCIENTIFIC_RESEARCH')).toBe('Scientific research');
    expect(purposeLabel('UNKNOWN_CODE')).toBe('UNKNOWN_CODE');
  });

  it('cohortFormationLabel returns undefined for a missing code', () => {
    expect(cohortFormationLabel(null)).toBeUndefined();
    expect(cohortFormationLabel('CRITERIA')).toBe('Formed based on the given criteria');
  });

  it('extractionMethodLabel maps known codes', () => {
    expect(extractionMethodLabel('RANDOM_SAMPLE')).toBe('Random sample');
  });

  it('extractionFrequencyLabel maps known codes', () => {
    expect(extractionFrequencyLabel('ONCE')).toBe('Once');
  });

  it('extractionIntervalLabel maps known codes', () => {
    expect(extractionIntervalLabel('QUARTERLY')).toBe('Quarterly');
  });
});
