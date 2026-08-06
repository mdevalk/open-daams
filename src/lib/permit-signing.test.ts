import { describe, it, expect } from 'vitest';
import {
  groupDatasetsByHolder,
  canonicalPermitPayload,
  canonicalDecisionCardPayload,
  buildDigitalPermitDocument,
} from '@/lib/permit-signing';

describe('groupDatasetsByHolder', () => {
  it('groups flat rows by data holder, preserving row order within a group', () => {
    const rows = [
      { dataHolderName: 'Hospital A', name: 'Dataset 1', url: null },
      { dataHolderName: 'Hospital B', name: 'Dataset 2', url: 'https://example.com' },
      { dataHolderName: 'Hospital A', name: 'Dataset 3', url: null },
    ];

    expect(groupDatasetsByHolder(rows)).toEqual([
      { dataHolderName: 'Hospital A', datasets: [{ name: 'Dataset 1', url: null }, { name: 'Dataset 3', url: null }] },
      { dataHolderName: 'Hospital B', datasets: [{ name: 'Dataset 2', url: 'https://example.com' }] },
    ]);
  });

  it('returns an empty array for no rows', () => {
    expect(groupDatasetsByHolder([])).toEqual([]);
  });
});

describe('canonicalPermitPayload', () => {
  it('serialises dates to ISO strings and carries the issuer kid', () => {
    const payload = canonicalPermitPayload(
      {
        permitNumber: 'DP-NL-2025-0001',
        version: 1,
        applicationId: 'app-1',
        issuedAt: new Date('2026-01-01T00:00:00Z'),
        validFrom: new Date('2026-01-01T00:00:00Z'),
        validUntil: new Date('2027-01-01T00:00:00Z'),
        grantedDatasets: [],
      },
      'kid-1',
    );

    expect(payload).toEqual({
      permitNumber: 'DP-NL-2025-0001',
      version: 1,
      applicationId: 'app-1',
      issuedAt: '2026-01-01T00:00:00.000Z',
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2027-01-01T00:00:00.000Z',
      grantedDatasets: [],
      issuerKid: 'kid-1',
    });
  });
});

describe('canonicalDecisionCardPayload', () => {
  it('serialises dates to ISO strings and carries the issuer kid', () => {
    const payload = canonicalDecisionCardPayload(
      {
        decisionId: 'DEC-NL-2026-0001',
        applicationId: 'app-1',
        decisionOutcome: 'NEGATIVE',
        decisionAt: new Date('2026-01-01T00:00:00Z'),
      },
      'kid-1',
    );

    expect(payload).toEqual({
      decisionId: 'DEC-NL-2026-0001',
      applicationId: 'app-1',
      decisionOutcome: 'NEGATIVE',
      decisionAt: '2026-01-01T00:00:00.000Z',
      issuerKid: 'kid-1',
    });
  });
});

describe('buildDigitalPermitDocument', () => {
  it('combines the canonical payload with the live display fields', () => {
    const doc = buildDigitalPermitDocument({
      permitNumber: 'DP-NL-2025-0001',
      version: 2,
      applicationId: 'app-1',
      issuedAt: new Date('2026-01-01T00:00:00Z'),
      validFrom: new Date('2026-01-01T00:00:00Z'),
      validUntil: new Date('2027-01-01T00:00:00Z'),
      grantedDatasets: [],
      status: 'REVOKED',
      revocationReason: 'No longer needed',
      revocationAt: new Date('2026-06-01T00:00:00Z'),
      signature: 'sig',
      signingKeyId: 'kid-1',
    });

    expect(doc.permitId).toBe('DP-NL-2025-0001-v2');
    expect(doc.status).toBe('REVOKED');
    expect(doc.revocationReason).toBe('No longer needed');
    expect(doc.revocationAt).toBe('2026-06-01T00:00:00.000Z');
    expect(doc.signature).toBe('sig');
    expect(doc.issuerKid).toBe('kid-1');
  });

  it('falls back to an empty issuer kid when the permit is unsigned', () => {
    const doc = buildDigitalPermitDocument({
      permitNumber: 'DP-NL-2025-0001',
      version: 1,
      applicationId: 'app-1',
      issuedAt: new Date('2026-01-01T00:00:00Z'),
      validFrom: new Date('2026-01-01T00:00:00Z'),
      validUntil: new Date('2027-01-01T00:00:00Z'),
      grantedDatasets: [],
      status: 'GRANTED',
      revocationReason: null,
      revocationAt: null,
      signature: null,
      signingKeyId: null,
    });

    expect(doc.issuerKid).toBe('');
    expect(doc.revocationAt).toBeNull();
  });
});
