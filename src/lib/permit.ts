import { DataPermitStatus, UserRole } from '@prisma/client';

export type PermitTransition = {
  to: DataPermitStatus;
  label: string;
  requiredRole: UserRole[];
  description: string;
  generatesNewPermitId: boolean;
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
export const PERMIT_TRANSITIONS: Record<DataPermitStatus, PermitTransition[]> = {
  GRANTED: [
    {
      to: 'REVOKED',
      label: 'Revoke permit',
      requiredRole: ['DECISION_MAKER', 'ADMIN'],
      description: 'Revoke the permit with documented justification (D6.4 §9.3).',
      generatesNewPermitId: false,
    },
    {
      to: 'EXPIRED',
      label: 'Mark as expired',
      requiredRole: ['CASE_HANDLER', 'ADMIN'],
      description: 'Permit has passed its validity date (D6.4 §9.3).',
      generatesNewPermitId: false,
    },
  ],
  AMENDED: [
    {
      to: 'REVOKED',
      label: 'Revoke permit',
      requiredRole: ['DECISION_MAKER', 'ADMIN'],
      description: 'Revoke the amended permit with documented justification.',
      generatesNewPermitId: false,
    },
    {
      to: 'EXPIRED',
      label: 'Mark as expired',
      requiredRole: ['CASE_HANDLER', 'ADMIN'],
      description: 'Permit has passed its validity date.',
      generatesNewPermitId: false,
    },
  ],
  // D6.4 §9.3: a permit that has been extended MUST NOT be extended a second time
  RENEWED: [
    {
      to: 'REVOKED',
      label: 'Revoke permit',
      requiredRole: ['DECISION_MAKER', 'ADMIN'],
      description: 'Revoke the renewed permit with documented justification.',
      generatesNewPermitId: false,
    },
    {
      to: 'EXPIRED',
      label: 'Mark as expired',
      requiredRole: ['CASE_HANDLER', 'ADMIN'],
      description: 'Permit has passed its validity date.',
      generatesNewPermitId: false,
    },
  ],
  // Terminal states
  REVOKED:  [],
  EXPIRED:  [],
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

export function nextPermitNumber(existing: string): string {
  // e.g. DP-NL-2025-0001 → DP-NL-2025-0002
  const parts = existing.split('-');
  const seq = parseInt(parts[parts.length - 1], 10);
  parts[parts.length - 1] = String(seq + 1).padStart(4, '0');
  return parts.join('-');
}
