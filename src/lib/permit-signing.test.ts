import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { concatBytes } from '@noble/hashes/utils';
import {
  groupDatasetsByHolder,
  canonicalPermitPayload,
  canonicalDecisionCardPayload,
  canonicalAppealDecisionPayload,
  buildDigitalPermitDocument,
  signPermit,
  verifyPermitSignature,
  getPublicJwk,
  signDecisionCard,
  signAppealDecision,
  type SignablePermit,
} from '@/lib/permit-signing';

// Same sha512Sync wiring permit-signing.ts itself does at module load, needed
// here to generate a disposable test keypair with @noble/ed25519 directly.
ed.etc.sha512Sync = (...m) => sha512(m.length === 1 ? m[0] : concatBytes(...m));

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, readFileSync: vi.fn() };
});

// A real, disposable Ed25519 keypair generated at test time — never the
// developer's actual (gitignored) keys/permit-signing-key.private.json, and
// never committed. loadPrivateKeyJwk() reads this via the mocked fs.readFileSync
// instead, so these tests exercise genuine sign/verify without touching disk
// or depending on a key file existing (CI never generates one before `npm test`).
const TEST_KID = 'test-key-1';
let testPublicKeyBase64Url: string;

beforeAll(() => {
  const privateKeyBytes = ed.utils.randomPrivateKey();
  const publicKeyBytes = ed.getPublicKey(privateKeyBytes);
  testPublicKeyBase64Url = toBase64Url(publicKeyBytes);
  const jwk = { d: toBase64Url(privateKeyBytes), x: testPublicKeyBase64Url, kid: TEST_KID };
  vi.mocked(readFileSync).mockReturnValue(JSON.stringify(jwk));
});

const BASE_PERMIT: SignablePermit = {
  permitNumber: 'DP-NL-2025-0001',
  version: 1,
  applicationId: 'app-1',
  issuedAt: new Date('2026-01-01T00:00:00Z'),
  validFrom: new Date('2026-01-01T00:00:00Z'),
  validUntil: new Date('2027-01-01T00:00:00Z'),
  grantedDatasets: [],
  speOperator: null,
};

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
      purposeCategory: null,
      purposeCategories: [],
      electronicHealthDataFormat: null,
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
      purposeCategory: null,
      purposeCategories: [],
      electronicHealthDataFormat: null,
    });

    expect(doc.issuerKid).toBe('');
    expect(doc.revocationAt).toBeNull();
  });
});

describe('canonicalAppealDecisionPayload', () => {
  it('serialises dates to ISO strings and carries the issuer kid', () => {
    const payload = canonicalAppealDecisionPayload(
      {
        appealId: 'appeal-1',
        applicationId: 'app-1',
        status: 'UPHELD',
        decisionAt: new Date('2026-01-01T00:00:00Z'),
      },
      'kid-1',
    );

    expect(payload).toEqual({
      appealId: 'appeal-1',
      applicationId: 'app-1',
      status: 'UPHELD',
      decisionAt: '2026-01-01T00:00:00.000Z',
      issuerKid: 'kid-1',
    });
  });
});

describe('signPermit / verifyPermitSignature', () => {
  it('round-trips: a freshly signed permit verifies successfully', async () => {
    const { signature, signedAt, signingKeyId } = await signPermit(BASE_PERMIT);

    expect(signingKeyId).toBe(TEST_KID);
    expect(signedAt).toBeInstanceOf(Date);

    const valid = await verifyPermitSignature({ ...BASE_PERMIT, signature, signingKeyId });
    expect(valid).toBe(true);
  });

  it('rejects a signature if the verified payload was tampered with', async () => {
    const { signature, signingKeyId } = await signPermit(BASE_PERMIT);

    const tampered: SignablePermit = { ...BASE_PERMIT, validUntil: new Date('2099-01-01T00:00:00Z') };
    const valid = await verifyPermitSignature({ ...tampered, signature, signingKeyId });
    expect(valid).toBe(false);
  });

  it('rejects a signingKeyId that does not match the currently loaded key', async () => {
    const { signature } = await signPermit(BASE_PERMIT);

    const valid = await verifyPermitSignature({
      ...BASE_PERMIT,
      signature,
      signingKeyId: 'some-other-key',
    });
    expect(valid).toBe(false);
  });

  it('rejects when signature or signingKeyId is missing', async () => {
    expect(await verifyPermitSignature({ ...BASE_PERMIT, signature: null, signingKeyId: TEST_KID })).toBe(false);
    expect(await verifyPermitSignature({ ...BASE_PERMIT, signature: 'sig', signingKeyId: null })).toBe(false);
  });

  it('produces an identical signature regardless of nested object key order (stableStringify)', async () => {
    const speOperatorInOneOrder = {
      id: 'op-1',
      name: 'RIVM SPE Operations',
      providerName: 'Acme Cloud',
      type: { id: 'type-1', name: 'Enterprise' },
    };
    // Same values, keys inserted in the reverse order.
    const speOperatorInReverseOrder = {
      type: { name: 'Enterprise', id: 'type-1' },
      providerName: 'Acme Cloud',
      name: 'RIVM SPE Operations',
      id: 'op-1',
    };

    const first = await signPermit({ ...BASE_PERMIT, speOperator: speOperatorInOneOrder });
    const second = await signPermit({ ...BASE_PERMIT, speOperator: speOperatorInReverseOrder });

    expect(first.signature).toBe(second.signature);
  });
});

describe('getPublicJwk', () => {
  it('exposes the public key and kid, and never the private key material', () => {
    const jwk = getPublicJwk();

    expect(jwk).toEqual({
      kty: 'OKP',
      crv: 'Ed25519',
      kid: TEST_KID,
      use: 'sig',
      alg: 'EdDSA',
      x: testPublicKeyBase64Url,
    });
    expect(jwk).not.toHaveProperty('d');
  });
});

describe('signDecisionCard', () => {
  it('produces a deterministic Ed25519 signature (same input signs identically every time)', async () => {
    const card = {
      decisionId: 'DEC-NL-2026-0001',
      applicationId: 'app-1',
      decisionOutcome: 'NEGATIVE' as const,
      decisionAt: new Date('2026-01-01T00:00:00Z'),
    };

    const first = await signDecisionCard(card);
    const second = await signDecisionCard(card);

    expect(first.signingKeyId).toBe(TEST_KID);
    expect(first.signature).toBe(second.signature);
  });
});

describe('signAppealDecision', () => {
  it('produces a deterministic Ed25519 signature (same input signs identically every time)', async () => {
    const appeal = {
      appealId: 'appeal-1',
      applicationId: 'app-1',
      status: 'UPHELD' as const,
      decisionAt: new Date('2026-01-01T00:00:00Z'),
    };

    const first = await signAppealDecision(appeal);
    const second = await signAppealDecision(appeal);

    expect(first.signingKeyId).toBe(TEST_KID);
    expect(first.signature).toBe(second.signature);
  });
});
