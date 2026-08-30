import { describe, it, expect } from 'vitest';
import {
  formatPermitId,
  resolveCurrentAndPendingVersion,
  derivePermitDisplayFlags,
  formatSpeOperatorLabel,
} from '@/lib/permit';

describe('formatPermitId', () => {
  it('shows the bare permit number for version 1', () => {
    expect(formatPermitId('DP-NL-2025-0001', 1)).toBe('DP-NL-2025-0001');
  });

  it('appends the version suffix for later versions (D6.4 R9.3.8)', () => {
    expect(formatPermitId('DP-NL-2025-0001', 2)).toBe('DP-NL-2025-0001-v2');
    expect(formatPermitId('DP-NL-2025-0001', 5)).toBe('DP-NL-2025-0001-v5');
  });
});

describe('resolveCurrentAndPendingVersion', () => {
  const base = { permitNumber: 'DP-NL-2025-0001', effectiveAt: null, activatedAt: null };

  it('finds the current version', () => {
    const versions = [
      { ...base, id: 'v1', version: 1, isCurrent: false },
      { ...base, id: 'v2', version: 2, isCurrent: true },
    ];
    expect(resolveCurrentAndPendingVersion(versions, 2).currentVersion?.id).toBe('v2');
  });

  it('returns null current version when none is marked current', () => {
    const versions = [{ ...base, id: 'v1', version: 1, isCurrent: false }];
    expect(resolveCurrentAndPendingVersion(versions, 1).currentVersion).toBeNull();
  });

  it('finds a pending next version with a deferred effective date, not yet activated (R9.3.9)', () => {
    const effectiveAt = new Date('2027-01-01');
    const versions = [
      { ...base, id: 'v2', version: 2, isCurrent: true },
      { ...base, id: 'v3', version: 3, isCurrent: false, effectiveAt, activatedAt: null },
    ];
    const { pendingVersion } = resolveCurrentAndPendingVersion(versions, 2);
    expect(pendingVersion).toEqual({ id: 'v3', permitNumber: 'DP-NL-2025-0001', version: 3, effectiveAt });
  });

  it('does not treat an already-activated next version as pending', () => {
    const versions = [
      { ...base, id: 'v2', version: 2, isCurrent: true },
      { ...base, id: 'v3', version: 3, isCurrent: false, effectiveAt: new Date('2027-01-01'), activatedAt: new Date('2027-01-02') },
    ];
    expect(resolveCurrentAndPendingVersion(versions, 2).pendingVersion).toBeNull();
  });

  it('does not treat a version with no effectiveAt as pending', () => {
    const versions = [
      { ...base, id: 'v2', version: 2, isCurrent: true },
      { ...base, id: 'v3', version: 3, isCurrent: false, effectiveAt: null, activatedAt: null },
    ];
    expect(resolveCurrentAndPendingVersion(versions, 2).pendingVersion).toBeNull();
  });

  it('only looks at the immediate next version, not any later one', () => {
    const effectiveAt = new Date('2027-01-01');
    const versions = [
      { ...base, id: 'v2', version: 2, isCurrent: true },
      { ...base, id: 'v4', version: 4, isCurrent: false, effectiveAt, activatedAt: null },
    ];
    expect(resolveCurrentAndPendingVersion(versions, 2).pendingVersion).toBeNull();
  });
});

describe('derivePermitDisplayFlags', () => {
  it('flags a DATA_REQUEST application', () => {
    const { isDataRequest } = derivePermitDisplayFlags({ validUntil: null }, { type: 'DATA_REQUEST', ethicalReviewRequired: null, ethicalReviewStatus: null });
    expect(isDataRequest).toBe(true);
  });

  it('computes a 6-month retention deadline from validUntil (Art. 68(12))', () => {
    const { retentionDeadline } = derivePermitDisplayFlags({ validUntil: new Date(2027, 0, 15) }, null);
    expect(retentionDeadline).toEqual(new Date(2027, 6, 15));
  });

  it('has no retention deadline when validUntil is unset', () => {
    expect(derivePermitDisplayFlags({ validUntil: null }, null).retentionDeadline).toBeNull();
  });

  it('shows the ethical review section when required and not NOT_REQUIRED', () => {
    const { showEthical } = derivePermitDisplayFlags(
      { validUntil: null },
      { type: 'DATA_ACCESS_APPLICATION', ethicalReviewRequired: true, ethicalReviewStatus: 'PENDING' },
    );
    expect(showEthical).toBe(true);
  });

  it('hides the ethical review section when status is NOT_REQUIRED', () => {
    const { showEthical } = derivePermitDisplayFlags(
      { validUntil: null },
      { type: 'DATA_ACCESS_APPLICATION', ethicalReviewRequired: true, ethicalReviewStatus: 'NOT_REQUIRED' },
    );
    expect(showEthical).toBe(false);
  });

  it('hides the ethical review section when not required', () => {
    const { showEthical } = derivePermitDisplayFlags(
      { validUntil: null },
      { type: 'DATA_ACCESS_APPLICATION', ethicalReviewRequired: false, ethicalReviewStatus: null },
    );
    expect(showEthical).toBe(false);
  });
});

describe('formatSpeOperatorLabel', () => {
  const t = (key: string, values?: Record<string, string>) =>
    key === 'speOperatorViaProvider' ? `${values?.operator} via ${values?.provider}` : key;

  it('returns null when there is no SPE operator', () => {
    expect(formatSpeOperatorLabel(null, t)).toBeNull();
  });

  it('returns the operator name alone when it has no provider', () => {
    expect(formatSpeOperatorLabel({ name: 'SURF', speProvider: null }, t)).toBe('SURF');
  });

  it('returns the "via provider" label when the operator has a provider', () => {
    expect(formatSpeOperatorLabel({ name: 'SURF', speProvider: { name: 'SURF Research Cloud' } }, t)).toBe(
      'SURF via SURF Research Cloud',
    );
  });
});
