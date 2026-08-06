import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAvailableTransitions,
  isTerminal,
  calculateDecisionDeadline,
  calculateAdditionalInfoDeadline,
  calculatePermitAcceptanceDeadline,
  deadlineStatus,
} from '@/lib/workflow';

describe('getAvailableTransitions', () => {
  it('only returns transitions the given role is allowed to take', () => {
    const forApplicant = getAvailableTransitions('SUBMITTED', 'DATA_ACCESS_APPLICATION', 'APPLICANT');
    expect(forApplicant.map((t) => t.to)).toEqual(['WITHDRAWN']);

    const forCaseHandler = getAvailableTransitions('SUBMITTED', 'DATA_ACCESS_APPLICATION', 'CASE_HANDLER');
    expect(forCaseHandler.map((t) => t.to).sort()).toEqual(['PRE_SCREENING', 'WITHDRAWN']);
  });

  it('returns nothing for a terminal status', () => {
    expect(getAvailableTransitions('WITHDRAWN', 'DATA_ACCESS_APPLICATION', 'ADMIN')).toEqual([]);
  });
});

describe('isTerminal', () => {
  it('treats DECISION_ISSUED and WITHDRAWN as terminal', () => {
    expect(isTerminal('DECISION_ISSUED')).toBe(true);
    expect(isTerminal('WITHDRAWN')).toBe(true);
  });

  it('treats every other status as non-terminal', () => {
    expect(isTerminal('SUBMITTED')).toBe(false);
    expect(isTerminal('PRE_SCREENING')).toBe(false);
  });
});

// calculateDecisionDeadline/calculateAdditionalInfoDeadline/calculatePermitAcceptanceDeadline
// all mutate via setMonth()/setDate(), which operate in the local timezone —
// so fixtures use local-time Date constructors (not UTC-midnight ISO strings)
// to stay correct across a DST boundary regardless of the test runner's timezone.
describe('calculateDecisionDeadline (EHDS Art. 68)', () => {
  it('gives STANDARD applicants 3 months, extendable to 6', () => {
    const from = new Date(2026, 0, 15);
    expect(calculateDecisionDeadline(from, 'STANDARD', false)).toEqual(new Date(2026, 3, 15));
    expect(calculateDecisionDeadline(from, 'STANDARD', true)).toEqual(new Date(2026, 6, 15));
  });

  it('gives EXPEDITED applicants 2 months, extendable to 3', () => {
    const from = new Date(2026, 0, 15);
    expect(calculateDecisionDeadline(from, 'EXPEDITED', false)).toEqual(new Date(2026, 2, 15));
    expect(calculateDecisionDeadline(from, 'EXPEDITED', true)).toEqual(new Date(2026, 3, 15));
  });

  it('defaults to the STANDARD, non-extended deadline', () => {
    const from = new Date(2026, 0, 15);
    expect(calculateDecisionDeadline(from)).toEqual(new Date(2026, 3, 15));
  });
});

describe('calculateAdditionalInfoDeadline', () => {
  it('adds 28 days (D6.4 §6)', () => {
    expect(calculateAdditionalInfoDeadline(new Date(2026, 0, 1))).toEqual(new Date(2026, 0, 29));
  });
});

describe('calculatePermitAcceptanceDeadline', () => {
  it('adds 28 days (D6.4 R9.2.6)', () => {
    expect(calculatePermitAcceptanceDeadline(new Date(2026, 0, 1))).toEqual(new Date(2026, 0, 29));
  });
});

describe('deadlineStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when there is no deadline', () => {
    expect(deadlineStatus(null)).toBeNull();
    expect(deadlineStatus(undefined)).toBeNull();
  });

  it('returns overdue once the deadline has passed', () => {
    expect(deadlineStatus(new Date('2025-12-31T00:00:00Z'))).toBe('overdue');
  });

  it('returns warning inside the 14-day window', () => {
    expect(deadlineStatus(new Date('2026-01-10T00:00:00Z'))).toBe('warning');
  });

  it('returns ok with more than 14 days remaining', () => {
    expect(deadlineStatus(new Date('2026-02-01T00:00:00Z'))).toBe('ok');
  });
});
