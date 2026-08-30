import { DataPermitStatus, UserRole } from '@prisma/client';

export type PermitTransition = {
  to: DataPermitStatus;
  label: string;
  requiredRole: UserRole[];
  description: string;
};

/**
 * TEHDAS2 D6.4 Section 9.3 — Data Permit lifecycle (the permit's OWN status).
 *
 * Amendments, renewals and revocation appeals are a separate workflow
 * (PermitChangeRequest, see lib/permit-change.ts); approving such a request
 * drives the status change. The transitions below are the DIRECT HDAB actions:
 *
 * active (GRANTED|AMENDED|RENEWED) → REVOKED   (enforcement)
 * active (GRANTED|AMENDED|RENEWED) → EXPIRED   (validity date passed)
 */
// label/description are i18n keys in the `permitTransitions` namespace.
const REVOKE: PermitTransition = {
  to: 'REVOKED',
  label: 'revoke',
  requiredRole: ['DECISION_MAKER', 'ADMIN'],
  description: 'revokeDesc',
};
const EXPIRE: PermitTransition = {
  to: 'EXPIRED',
  label: 'expire',
  requiredRole: ['CASE_HANDLER', 'ADMIN'],
  description: 'expireDesc',
};

export const PERMIT_TRANSITIONS: Record<DataPermitStatus, PermitTransition[]> = {
  GRANTED: [REVOKE, EXPIRE],
  AMENDED: [REVOKE, EXPIRE],
  // D6.4 §9.3: a permit that has been extended MUST NOT be extended a second time
  RENEWED: [REVOKE, EXPIRE],
  // Terminal states
  REVOKED: [],
  EXPIRED: [],
};

export const PERMIT_STATUS_COLORS: Record<DataPermitStatus, string> = {
  GRANTED:  'bg-emerald-100 text-emerald-700',
  AMENDED:  'bg-blue-100 text-blue-700',
  RENEWED:  'bg-teal-100 text-teal-700',
  REVOKED:  'bg-red-100 text-red-700',
  EXPIRED:  'bg-gray-100 text-gray-500',
};

// The full, human-readable permit id combines the stable base number with the
// version (D6.4 R9.3.8), e.g. "DP-NL-2025-0001-v2". Version 1 shows the bare
// number for readability.
export function formatPermitId(permitNumber: string, version: number): string {
  return version > 1 ? `${permitNumber}-v${version}` : permitNumber;
}

type PermitVersionSummary = {
  id: string;
  permitNumber: string;
  version: number;
  isCurrent: boolean;
  effectiveAt: Date | null;
  activatedAt: Date | null;
};

// Resolves the current version and (if any) the pending next version from a
// permit's full version chain (D6.4 §9.3). "Pending" (R9.3.9) means: the next
// version was approved with a deferred effective date and hasn't been
// activated yet — only ever set for the current permit's own successor,
// since a new amendment can only be requested while the permit is current.
export function resolveCurrentAndPendingVersion(
  versions: PermitVersionSummary[],
  currentPermitVersion: number,
): {
  currentVersion: PermitVersionSummary | null;
  pendingVersion: { id: string; permitNumber: string; version: number; effectiveAt: Date } | null;
} {
  const currentVersion = versions.find((v) => v.isCurrent) ?? null;
  const pendingVersionRaw =
    versions.find((v) => v.version === currentPermitVersion + 1 && v.effectiveAt && !v.activatedAt) ?? null;
  const pendingVersion = pendingVersionRaw?.effectiveAt
    ? {
        id: pendingVersionRaw.id,
        permitNumber: pendingVersionRaw.permitNumber,
        version: pendingVersionRaw.version,
        effectiveAt: pendingVersionRaw.effectiveAt,
      }
    : null;
  return { currentVersion, pendingVersion };
}

type PermitDisplayApplication = {
  type: 'DATA_REQUEST' | 'DATA_ACCESS_APPLICATION';
  ethicalReviewRequired: boolean | null;
  ethicalReviewStatus: string | null;
} | null;

// Retention deadline: data deleted ≤ 6 months after the permit expires (Art. 68(12)).
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function derivePermitDisplayFlags(
  permit: { validUntil: Date | string | null },
  app: PermitDisplayApplication,
): { isDataRequest: boolean; retentionDeadline: Date | null; showEthical: boolean } {
  return {
    isDataRequest: app?.type === 'DATA_REQUEST',
    retentionDeadline: permit.validUntil ? addMonths(new Date(permit.validUntil), 6) : null,
    showEthical: Boolean(app?.ethicalReviewRequired && app.ethicalReviewStatus && app.ethicalReviewStatus !== 'NOT_REQUIRED'),
  };
}

type SpeOperatorForLabel = { name: string; speProvider: { name: string } | null } | null;

export function formatSpeOperatorLabel(
  speOperator: SpeOperatorForLabel,
  t: (key: string, values?: Record<string, string>) => string,
): string | null {
  if (!speOperator) return null;
  if (!speOperator.speProvider) return speOperator.name;
  return t('speOperatorViaProvider', { operator: speOperator.name, provider: speOperator.speProvider.name });
}
