import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { concatBytes } from '@noble/hashes/utils';
import { readFileSync } from 'fs';
import path from 'path';
import { DataPermitStatus, DecisionOutcome } from '@prisma/client';
import { formatPermitId } from './permit';

// Required by @noble/ed25519 v2's sync sign/verify (no Web Crypto dependency).
// sha512Sync receives the message in parts that must be hashed as one; sha512
// itself only takes a single buffer, so multi-part calls need concatenating.
ed.etc.sha512Sync = (...m) => sha512(m.length === 1 ? m[0] : concatBytes(...m));

export const SIGNING_ALGORITHM = 'Ed25519';

type PrivateKeyJwk = { d: string; x: string; kid: string };

let cachedKey: PrivateKeyJwk | null = null;

function loadPrivateKeyJwk(): PrivateKeyJwk {
  if (cachedKey) return cachedKey;
  const keyPath = path.join(process.cwd(), 'keys', 'permit-signing-key.private.json');
  let raw: string;
  try {
    raw = readFileSync(keyPath, 'utf-8');
  } catch {
    throw new Error(
      `No permit-signing key found at ${keyPath}. Run "npm run generate-signing-key" to create one.`,
    );
  }
  cachedKey = JSON.parse(raw) as PrivateKeyJwk;
  return cachedKey;
}

function fromBase64Url(b64url: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64url, 'base64url'));
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

// Deterministic JSON: recursively sort object keys before stringifying, so
// the signed bytes never depend on property insertion order.
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export type DatasetEntry = { name: string; url: string | null };
export type GrantedDatasetGroup = { dataHolderName: string; datasets: DatasetEntry[] };

/** Groups flat (dataHolderName, name, url) rows — as stored in RequestedDataset/GrantedDataset — by holder. */
export function groupDatasetsByHolder(
  rows: { dataHolderName: string; name: string; url: string | null }[],
): GrantedDatasetGroup[] {
  const byHolder = new Map<string, DatasetEntry[]>();
  for (const row of rows) {
    const entry = { name: row.name, url: row.url };
    const existing = byHolder.get(row.dataHolderName);
    if (existing) existing.push(entry);
    else byHolder.set(row.dataHolderName, [entry]);
  }
  return Array.from(byHolder.entries()).map(([dataHolderName, datasets]) => ({ dataHolderName, datasets }));
}

export type SignablePermit = {
  permitNumber: string;
  version: number;
  applicationId: string;
  issuedAt: Date;
  validFrom: Date;
  validUntil: Date;
  grantedDatasets: GrantedDatasetGroup[];
};

/**
 * The fixed subset of a permit version that gets signed. Deliberately
 * excludes `status`/`revocationReason`/`revocationAt` (they mutate in place
 * on the same row via REVOKE/EXPIRE — signing them would invalidate the
 * signature the moment a permit is legitimately revoked) and
 * `authorizedPersons` (managed via separate endpoints, not fixed at
 * issuance). `grantedDatasets` IS included — unlike those, it's fixed for
 * the life of a permit version (copied from the application's
 * RequestedDataset rows at issuance, carried forward unchanged on later
 * versions — see GrantedDataset in schema.prisma), and it's the substantive
 * answer to "what does this permit actually grant access to, from which
 * data holder," which the signature should attest to. Mirrors the same
 * exclusion/inclusion principle used by the reference
 * hdab-nl-permit-generator/validator pair (whose canonical payload signs
 * `datasets` alongside identity fields).
 *
 * `issuerKid` is passed explicitly rather than always read from the
 * currently-loaded key file — after a key rotation (`generate-signing-key
 * --force`), an older permit's payload must reflect the kid that actually
 * signed it, not today's active key.
 */
export function canonicalPermitPayload(permit: SignablePermit, issuerKid: string) {
  return {
    permitNumber: permit.permitNumber,
    version: permit.version,
    applicationId: permit.applicationId,
    issuedAt: permit.issuedAt.toISOString(),
    validFrom: permit.validFrom.toISOString(),
    validUntil: permit.validUntil.toISOString(),
    grantedDatasets: permit.grantedDatasets,
    issuerKid,
  };
}

export async function signPermit(
  permit: SignablePermit,
): Promise<{ signature: string; signedAt: Date; signingKeyId: string }> {
  const { d, kid } = loadPrivateKeyJwk();
  const privateKeyBytes = fromBase64Url(d);
  const payload = canonicalPermitPayload(permit, kid);
  const encoded = new TextEncoder().encode(stableStringify(payload));
  const sigBytes = ed.sign(encoded, privateKeyBytes);
  return { signature: toBase64Url(sigBytes), signedAt: new Date(), signingKeyId: kid };
}

export type VerifiablePermit = SignablePermit & { signature: string | null; signingKeyId: string | null };

export async function verifyPermitSignature(permit: VerifiablePermit): Promise<boolean> {
  if (!permit.signature || !permit.signingKeyId) return false;
  const { x, kid } = loadPrivateKeyJwk();
  if (permit.signingKeyId !== kid) return false; // signed with a key we no longer hold
  const publicKeyBytes = fromBase64Url(x);
  const payload = canonicalPermitPayload(permit, permit.signingKeyId);
  const encoded = new TextEncoder().encode(stableStringify(payload));
  const sigBytes = fromBase64Url(permit.signature);
  return ed.verify(sigBytes, encoded, publicKeyBytes);
}

// TODO: implement key rotation. Today there's a single active key: the
// generation script refuses to overwrite one without --force, and JWKS only
// ever publishes the current key. After a rotation, permits signed with a
// retired key become unverifiable (verifyPermitSignature already rejects a
// signingKeyId that isn't the current kid — see the comment there). A real
// rotation mechanism needs JWKS to publish multiple keys (current + retired,
// keyed by kid) so historical signatures stay verifiable.

/** Public-only JWK for the `.well-known/jwks.json` endpoint — never includes `d`. */
export function getPublicJwk() {
  const { x, kid } = loadPrivateKeyJwk();
  return {
    kty: 'OKP',
    crv: 'Ed25519',
    kid,
    use: 'sig',
    alg: 'EdDSA',
    x,
  };
}

export type SignableDecisionCard = {
  decisionId: string;
  applicationId: string;
  decisionOutcome: DecisionOutcome;
  decisionAt: Date;
};

/**
 * The signed subset of a negative decision card (D6.4 R9.2.3 — the negative
 * decision-card PDF must be signed). Positive decision cards stay unsigned
 * by design (R9.2.2 — a pre-permit for review, not a final document), so
 * there's no equivalent function for the positive path.
 */
export function canonicalDecisionCardPayload(card: SignableDecisionCard, issuerKid: string) {
  return {
    decisionId: card.decisionId,
    applicationId: card.applicationId,
    decisionOutcome: card.decisionOutcome,
    decisionAt: card.decisionAt.toISOString(),
    issuerKid,
  };
}

export async function signDecisionCard(
  card: SignableDecisionCard,
): Promise<{ signature: string; signedAt: Date; signingKeyId: string }> {
  const { d, kid } = loadPrivateKeyJwk();
  const privateKeyBytes = fromBase64Url(d);
  const payload = canonicalDecisionCardPayload(card, kid);
  const encoded = new TextEncoder().encode(stableStringify(payload));
  const sigBytes = ed.sign(encoded, privateKeyBytes);
  return { signature: toBase64Url(sigBytes), signedAt: new Date(), signingKeyId: kid };
}

export type DigitalPermitDocument = ReturnType<typeof canonicalPermitPayload> & {
  permitId: string;
  status: DataPermitStatus;
  revocationReason: string | null;
  revocationAt: string | null;
  signature: string | null;
  signingKeyId: string | null;
  algorithm: string;
};

/**
 * Assembles the full exportable "digital permit" document: the signed
 * canonical fields, plus unsigned/live display fields (status, revocation).
 * Used by both the JSON export route and the PDF's embedded attachment, so
 * there's a single definition of what the digital permit document contains.
 */
export function buildDigitalPermitDocument(permit: {
  permitNumber: string;
  version: number;
  applicationId: string;
  issuedAt: Date;
  validFrom: Date;
  validUntil: Date;
  grantedDatasets: GrantedDatasetGroup[];
  status: DataPermitStatus;
  revocationReason: string | null;
  revocationAt: Date | null;
  signature: string | null;
  signingKeyId: string | null;
}): DigitalPermitDocument {
  const payload = canonicalPermitPayload(permit, permit.signingKeyId ?? '');
  return {
    ...payload,
    permitId: formatPermitId(permit.permitNumber, permit.version),
    status: permit.status,
    revocationReason: permit.revocationReason,
    revocationAt: permit.revocationAt ? permit.revocationAt.toISOString() : null,
    signature: permit.signature,
    signingKeyId: permit.signingKeyId,
    algorithm: SIGNING_ALGORITHM,
  };
}
