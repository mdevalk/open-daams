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
      {
        dataHolderName: 'Hospital A',
        datasets: [
          { name: 'Dataset 1', url: null, datasetId: null, catalogId: null, distributions: [] },
          { name: 'Dataset 3', url: null, datasetId: null, catalogId: null, distributions: [] },
        ],
      },
      {
        dataHolderName: 'Hospital B',
        datasets: [
          { name: 'Dataset 2', url: 'https://example.com', datasetId: null, catalogId: null, distributions: [] },
        ],
      },
    ]);
  });

  it('returns an empty array for no rows', () => {
    expect(groupDatasetsByHolder([])).toEqual([]);
  });

  it('carries the EU Dataset Catalogue identifiers and distributions through', () => {
    const rows = [
      {
        dataHolderName: 'RIVM',
        name: 'Praeventis',
        url: null,
        datasetId: '24b6a9b2-4519-4f94-8c0f-c4c85f295806',
        catalogId: '6be71aaf-abd3-464f-a417-708b780d4bef',
        distributions: [{ distributionId: '58501e07-7717-497c-869a-c52826e3bb24', title: null }],
      },
    ];

    expect(groupDatasetsByHolder(rows)).toEqual([
      {
        dataHolderName: 'RIVM',
        datasets: [
          {
            name: 'Praeventis',
            url: null,
            datasetId: '24b6a9b2-4519-4f94-8c0f-c4c85f295806',
            catalogId: '6be71aaf-abd3-464f-a417-708b780d4bef',
            distributions: [{ distributionId: '58501e07-7717-497c-869a-c52826e3bb24', title: null }],
          },
        ],
      },
    ]);
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
        speOperator: null,
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
      speOperator: null,
      issuerKid: 'kid-1',
    });
  });

  it('carries the SPE operator, with its type nested inside, into the signed payload (R13.0.1)', () => {
    const payload = canonicalPermitPayload(
      {
        permitNumber: 'DP-NL-2025-0001',
        version: 1,
        applicationId: 'app-1',
        issuedAt: new Date('2026-01-01T00:00:00Z'),
        validFrom: new Date('2026-01-01T00:00:00Z'),
        validUntil: new Date('2027-01-01T00:00:00Z'),
        grantedDatasets: [],
        speOperator: {
          id: 'op-1',
          name: 'RIVM SPE Operations',
          providerName: 'Acme Cloud',
          type: { id: 'type-1', name: 'Enterprise' },
        },
      },
      'kid-1',
    );

    expect(payload.speOperator).toEqual({
      id: 'op-1',
      name: 'RIVM SPE Operations',
      providerName: 'Acme Cloud',
      type: { id: 'type-1', name: 'Enterprise' },
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
      speOperator: null,
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
      speOperator: null,
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
