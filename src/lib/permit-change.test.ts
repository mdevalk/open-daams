import { describe, it, expect } from 'vitest';
import { requestableTypes } from '@/lib/permit-change';

describe('requestableTypes', () => {
  it('allows amendment and renewal on a granted permit', () => {
    expect(requestableTypes('GRANTED')).toEqual(['AMENDMENT', 'RENEWAL']);
  });

  it('allows amendment and renewal on an amended permit', () => {
    expect(requestableTypes('AMENDED')).toEqual(['AMENDMENT', 'RENEWAL']);
  });

  it('only allows amendment on a renewed permit (D6.4 §9.3: no second renewal)', () => {
    expect(requestableTypes('RENEWED')).toEqual(['AMENDMENT']);
  });

  it('only allows a revocation appeal on a revoked permit', () => {
    expect(requestableTypes('REVOKED')).toEqual(['REVOCATION_APPEAL']);
  });

  it('allows nothing further on an expired permit', () => {
    expect(requestableTypes('EXPIRED')).toEqual([]);
  });
});
