import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cn,
  formatDate,
  formatDateNumeric,
  formatDateTime,
  daysUntil,
  serializePrisma,
  readErrorMessage,
  purposeLabel,
  cohortFormationLabel,
  extractionMethodLabel,
  extractionFrequencyLabel,
  extractionIntervalLabel,
  yesNoLabel,
  populationLabel,
  dataPeriodLabel,
  extractionIntervalDisplay,
  informationProviderLabel,
  hasBaseSectionData,
} from '@/lib/utils';

const t = (key: string) => key;

describe('cn', () => {
  it('joins class names and drops falsy values', () => {
    expect(cn('a', false, 'b', undefined, null, 'c')).toBe('a b c');
  });
});

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

describe('readErrorMessage', () => {
  it('returns the error field from a JSON body', async () => {
    const res = { json: () => Promise.resolve({ error: 'Something broke' }) } as Response;
    expect(await readErrorMessage(res, 'fallback')).toBe('Something broke');
  });

  it('returns the fallback when the body has no error field', async () => {
    const res = { json: () => Promise.resolve({}) } as Response;
    expect(await readErrorMessage(res, 'fallback')).toBe('fallback');
  });

  it('returns the fallback when the body is not valid JSON', async () => {
    const res = { json: () => Promise.reject(new Error('not json')) } as Response;
    expect(await readErrorMessage(res, 'fallback')).toBe('fallback');
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

  it('extractionMethodLabel maps a known code, falls back to the raw code, and returns undefined for a missing code', () => {
    expect(extractionMethodLabel('RANDOM_SAMPLE')).toBe('Random sample');
    expect(extractionMethodLabel('UNKNOWN_CODE')).toBe('UNKNOWN_CODE');
    expect(extractionMethodLabel(null)).toBeUndefined();
  });

  it('extractionFrequencyLabel maps a known code, falls back to the raw code, and returns undefined for a missing code', () => {
    expect(extractionFrequencyLabel('ONCE')).toBe('Once');
    expect(extractionFrequencyLabel('UNKNOWN_CODE')).toBe('UNKNOWN_CODE');
    expect(extractionFrequencyLabel(null)).toBeUndefined();
  });

  it('extractionIntervalLabel maps a known code, falls back to the raw code, and returns undefined for a missing code', () => {
    expect(extractionIntervalLabel('QUARTERLY')).toBe('Quarterly');
    expect(extractionIntervalLabel('UNKNOWN_CODE')).toBe('UNKNOWN_CODE');
    expect(extractionIntervalLabel(null)).toBeUndefined();
  });
});

describe('yesNoLabel', () => {
  it('returns "yes" for true and "no" for false', () => {
    expect(yesNoLabel(true, t)).toBe('yes');
    expect(yesNoLabel(false, t)).toBe('no');
  });

  it('returns undefined for null or undefined', () => {
    expect(yesNoLabel(null, t)).toBeUndefined();
    expect(yesNoLabel(undefined, t)).toBeUndefined();
  });
});

describe('populationLabel', () => {
  it('returns undefined when size is null', () => {
    expect(populationLabel({ size: null, sizeIsEstimate: null }, t)).toBeUndefined();
  });

  it('returns the bare size when sizeIsEstimate is null', () => {
    expect(populationLabel({ size: 500, sizeIsEstimate: null }, t)).toBe('500');
  });

  it('appends "estimate" or "exact" when sizeIsEstimate is set', () => {
    expect(populationLabel({ size: 500, sizeIsEstimate: true }, t)).toBe('500 (estimate)');
    expect(populationLabel({ size: 500, sizeIsEstimate: false }, t)).toBe('500 (exact)');
  });
});

describe('dataPeriodLabel', () => {
  it('prefers timePeriod when set', () => {
    expect(dataPeriodLabel({ timePeriod: '2020-2022', dataStartDate: null, dataEndDate: null })).toBe('2020-2022');
  });

  it('falls back to a formatted start–end range', () => {
    expect(
      dataPeriodLabel({ timePeriod: null, dataStartDate: '2020-01-01', dataEndDate: '2020-06-01' }),
    ).toContain('–');
  });

  it('returns undefined when neither is set', () => {
    expect(dataPeriodLabel({ timePeriod: null, dataStartDate: null, dataEndDate: null })).toBeUndefined();
  });
});

describe('extractionIntervalDisplay', () => {
  it('returns undefined when there is no interval', () => {
    expect(extractionIntervalDisplay({ extractionInterval: null, extractionIntervalOther: null })).toBeUndefined();
  });

  it('formats a known interval', () => {
    expect(extractionIntervalDisplay({ extractionInterval: 'QUARTERLY', extractionIntervalOther: null })).toBe('Quarterly');
  });

  it('appends the "other" detail when the interval is OTHER', () => {
    expect(extractionIntervalDisplay({ extractionInterval: 'OTHER', extractionIntervalOther: 'Twice a year' })).toBe(
      'Other — Twice a year',
    );
  });
});

describe('informationProviderLabel', () => {
  it('returns "sameAsContactPerson" when flagged as such', () => {
    expect(
      informationProviderLabel(
        { informationProviderSameAsContactPerson: true, informationProviderName: 'X', informationProviderEmail: null, informationProviderPhone: null },
        t,
      ),
    ).toBe('sameAsContactPerson');
  });

  it('joins name/email/phone otherwise', () => {
    expect(
      informationProviderLabel(
        {
          informationProviderSameAsContactPerson: false,
          informationProviderName: 'Dr. Jansen',
          informationProviderEmail: 'j@example.com',
          informationProviderPhone: null,
        },
        t,
      ),
    ).toBe('Dr. Jansen · j@example.com');
  });
});

describe('hasBaseSectionData', () => {
  const empty = {
    hdabContacts: null,
    howWillDataBeLinked: null,
    dataSubjectsInformed: null,
    hasTheStudyCohortBeenFormedBasedOnInformationOfStudyParticipants: null,
    doesTheInformedConsentCoverTheRequestedRegistryExtractions: null,
    confirmThatDataPermitHasBeenGrantedForTheResearchProject: null,
    howTheStudyCohortWasObtained: null,
    detailsOfHowTheStudyCohortHasBeenFormed: null,
    whyNeedDataOfaWholePopulation: null,
    regionsSeekForData: null,
    informationProviderName: null,
    informationProviderSameAsContactPerson: null,
  };

  it('returns false when every field is empty', () => {
    expect(hasBaseSectionData(empty)).toBe(false);
  });

  it('returns true when any single field is set', () => {
    expect(hasBaseSectionData({ ...empty, hdabContacts: 'Dr. Jansen' })).toBe(true);
    expect(hasBaseSectionData({ ...empty, dataSubjectsInformed: false })).toBe(true);
  });
});
