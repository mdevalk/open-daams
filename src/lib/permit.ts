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

export const PERMIT_STATUS_LABELS: Record<DataPermitStatus, string> = {
  GRANTED:  'Granted',
  AMENDED:  'Amended',
  RENEWED:  'Renewed',
  REVOKED:  'Revoked',
  EXPIRED:  'Expired',
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
