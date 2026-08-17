import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { concatBytes } from '@noble/hashes/utils';
import { readFileSync } from 'fs';
import path from 'path';
import { AppealStatus, DataPermitStatus, DecisionOutcome } from '@prisma/client';
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

// EU Dataset Catalogue's own distribution — one way a dataset can actually be
// accessed. Carried through verbatim from the HD@EU/NCP wire (distribution_id
// + title), not modelled beyond that (open-daams doesn't own the catalogue).
export type Distribution = { distributionId: string; title: string | null };

// The instruction to the data holder for this specific dataset — created
// alongside its GrantedDataset at issuance (src/app/api/permits/route.ts),
// frozen and signed the same way the rest of DatasetEntry is. See
// StorageLocation in schema.prisma.
export type SignableStorageLocation = { reference: string; writerDid: string };

export type DatasetEntry = {
  name: string;
  url: string | null;
  // EU Dataset Catalogue identifiers — traceability, not local FKs (see
  // RequestedDataset/GrantedDataset in schema.prisma for the source fields).
  datasetId: string | null;
  catalogId: string | null;
  distributions: Distribution[];
  storageLocation: SignableStorageLocation | null;
};
export type GrantedDatasetGroup = { dataHolderName: string; datasets: DatasetEntry[] };

/**
 * Groups flat (dataHolderName, name, url, ...) rows — as stored in
 * RequestedDataset/GrantedDataset — by holder. `distributions` is accepted as
 * `unknown` and cast internally: it round-trips through a Prisma `Json`
 * column, so callers passing a raw query result have it typed as
 * `Prisma.JsonValue`, not `Distribution[]`, even though its actual shape is
 * always the latter (or absent).
 */
export function groupDatasetsByHolder(
  rows: {
    dataHolderName: string;
    name: string;
    url: string | null;
    datasetId?: string | null;
    catalogId?: string | null;
    distributions?: unknown;
    storageLocation?: SignableStorageLocation | null;
  }[],
): GrantedDatasetGroup[] {
  const byHolder = new Map<string, DatasetEntry[]>();
  for (const row of rows) {
    const entry: DatasetEntry = {
      name: row.name,
      url: row.url,
      datasetId: row.datasetId ?? null,
      catalogId: row.catalogId ?? null,
      distributions: (row.distributions as Distribution[] | null) ?? [],
      // Narrowed explicitly: callers that fetch a full Prisma StorageLocation
      // row (id/grantedDatasetId/authorizedAt/etc.) would otherwise have
      // those extra fields silently pass through at runtime — TS structural
      // typing doesn't strip them — producing a payload that differs from
      // what was actually signed (see the issuance route, which already
      // passes the narrow shape) and breaking signature verification.
      storageLocation: row.storageLocation
        ? { reference: row.storageLocation.reference, writerDid: row.storageLocation.writerDid }
        : null,
    };
    const existing = byHolder.get(row.dataHolderName);
    if (existing) existing.push(entry);
    else byHolder.set(row.dataHolderName, [entry]);
  }
  return Array.from(byHolder.entries()).map(([dataHolderName, datasets]) => ({ dataHolderName, datasets }));
}

// Frozen snapshots, not live FK references — same rationale as
// GrantedDataset.dataHolderName: renaming an SpeOperator/SpeType in
// the masterdata registry after a permit references it must not change
// what that permit's signature attests to. Resolved once, at the moment a
// permit version is created (issuance, or a version-creating amendment that
// changes the operator/type), and carried forward unchanged on versions
// that don't touch it — see the callers in
// src/app/api/permits/route.ts and .../change-requests/[requestId]/route.ts.
export type SignableSpeType = { id: string; name: string };
export type SignableSpeOperator = {
  id: string;
  name: string;
  providerName: string | null;
  type: SignableSpeType | null;
};

// The researcher/output-controller AuthorizedPerson rows — set at issuance
// (src/app/api/permits/route.ts) and re-selectable only when an amendment
// is approved (.../change-requests/[requestId]/route.ts), never added or
// changed ad hoc on an existing version, so every AuthorizedPerson row that
// exists is always part of some version's signature. Deliberately
// name-free: the permit document itself carries only organisation +
// identity, never the individual's name — that stays in AuthorizedPerson's
// own DB row for HDAB's internal case management, never on the
// signed/printed permit.
export type SignableAuthorizedPerson = { affiliation: string; did: string };

export type SignablePermit = {
  permitNumber: string;
  version: number;
  applicationId: string;
  issuedAt: Date;
  validFrom: Date;
  validUntil: Date;
  grantedDatasets: GrantedDatasetGroup[];
  speOperator: SignableSpeOperator | null;
  researcher: SignableAuthorizedPerson | null;
  outputController: SignableAuthorizedPerson;
};

/**
 * The fixed subset of a permit version that gets signed. Deliberately
 * excludes `status`/`revocationReason`/`revocationAt` (they mutate in place
 * on the same row via REVOKE/EXPIRE — signing them would invalidate the
 * signature the moment a permit is legitimately revoked). `grantedDatasets`
 * IS included — it's fixed for the life of a permit version (copied from the
 * application's RequestedDataset rows at issuance, carried forward
 * unchanged on later versions — see GrantedDataset in schema.prisma, and
 * its nested `storageLocation`, StorageLocation in schema.prisma, created
 * alongside it), and it's the substantive answer to "what does this permit
 * actually grant access to, from which data holder, and where should that
 * data land," which the signature should attest to. Mirrors the same
 * exclusion/inclusion principle used by the reference
 * hdab-nl-permit-generator/validator pair (whose canonical payload signs
 * `datasets` alongside identity fields). `speOperator` (with its `type`
 * nested inside) is signed for the same reason (R13.0.1 — the designated
 * SPE/operator is part of what the permit grants); so are `researcher` and
 * `outputController` — both are created and fixed in the same issuance
 * transaction as everything else here, unlike ordinary AuthorizedPerson
 * additions. Fees are deliberately excluded — those stay on the
 * human-readable PDF only, not this signed structured document.
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
    speOperator: permit.speOperator,
    researcher: permit.researcher,
    outputController: permit.outputController,
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

export type SignableAppealDecision = {
  appealId: string;
  applicationId: string;
  status: AppealStatus;
  decisionAt: Date;
};

/**
 * The signed subset of a terminal appeal decision (D6.4 R10.0.6 — the
 * formal decision on an appeal must be a signed document). Both UPHELD and
 * REJECTED are equally final outcomes for an appeal — unlike the decision
 * card's positive/negative asymmetry, there's no "pending further action"
 * state for either, so both get signed. WITHDRAWN isn't a decision on the
 * merits, so it's never passed here.
 */
export function canonicalAppealDecisionPayload(appeal: SignableAppealDecision, issuerKid: string) {
  return {
    appealId: appeal.appealId,
    applicationId: appeal.applicationId,
    status: appeal.status,
    decisionAt: appeal.decisionAt.toISOString(),
    issuerKid,
  };
}

export async function signAppealDecision(
  appeal: SignableAppealDecision,
): Promise<{ signature: string; signedAt: Date; signingKeyId: string }> {
  const { d, kid } = loadPrivateKeyJwk();
  const privateKeyBytes = fromBase64Url(d);
  const payload = canonicalAppealDecisionPayload(appeal, kid);
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
  // Frozen at issuance (D6.4 R7.3.2/R7.4.2 — structured decision elements
  // for future reporting/publication), but deliberately kept OUTSIDE the
  // signed canonical payload above: adding them there would change what
  // every already-issued permit's stored signature was computed over,
  // breaking verification for historical permits. Unsigned/display fields,
  // same treatment as status/revocation below.
  purposeCategory: string | null;
  purposeCategories: string[];
  electronicHealthDataFormat: string | null;
};

/**
 * Assembles the full exportable "digital permit" document: the signed
 * canonical fields (now including speOperator/speType — R13.0.1),
 * plus unsigned/live display fields (status, revocation, purpose/data
 * format). Used by both the JSON export route and the PDF's embedded
 * attachment, so there's a single definition of what the digital permit
 * document contains.
 */
export function buildDigitalPermitDocument(permit: SignablePermit & {
  status: DataPermitStatus;
  revocationReason: string | null;
  revocationAt: Date | null;
  signature: string | null;
  signingKeyId: string | null;
  purposeCategory: string | null;
  purposeCategories: string[];
  electronicHealthDataFormat: string | null;
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
    purposeCategory: permit.purposeCategory,
    purposeCategories: permit.purposeCategories,
    electronicHealthDataFormat: permit.electronicHealthDataFormat,
  };
}
