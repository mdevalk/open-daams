import { PermitChangeType, PermitChangeStatus, DataPermitStatus, UserRole } from '@prisma/client';

/**
 * TEHDAS2 D6.4 §9.3/§9.4 — workflow for a change requested against an already-issued
 * permit, kept DISTINCT from the permit's own status (see lib/permit.ts). Approving a
 * request drives a DataPermit status change; rejecting leaves the permit unchanged.
 */

export const CHANGE_TYPE_LABELS: Record<PermitChangeType, string> = {
  AMENDMENT: 'Amendment',
  RENEWAL: 'Renewal',
  REVOCATION_APPEAL: 'Revocation appeal',
};

export const CHANGE_STATUS_LABELS: Record<PermitChangeStatus, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export const CHANGE_STATUS_COLORS: Record<PermitChangeStatus, string> = {
  REQUESTED: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
};

// Staff may document a request; only decision makers approve/reject it.
export const REQUEST_ROLES: UserRole[] = ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'];
export const DECIDE_ROLES: UserRole[] = ['DECISION_MAKER', 'ADMIN'];

/**
 * Which change types may be requested against a permit in a given status.
 * - AMENDMENT / RENEWAL only while the permit is active; no second renewal after RENEWED.
 * - REVOCATION_APPEAL only when the permit is REVOKED.
 */
export function requestableTypes(permitStatus: DataPermitStatus): PermitChangeType[] {
  switch (permitStatus) {
    case 'GRANTED':
    case 'AMENDED':
      return ['AMENDMENT', 'RENEWAL'];
    case 'RENEWED':
      return ['AMENDMENT']; // D6.4 §9.3: MUST NOT be renewed a second time
    case 'REVOKED':
      return ['REVOCATION_APPEAL'];
    default:
      return []; // EXPIRED — nothing further
  }
}

/**
 * The permit status an APPROVED request produces, and whether it issues a new permit
 * version. Per D6.4 R9.3.6, approving an amendment, renewal or revocation appeal
 * generates an up-to-date permit version (new ID).
 */
export const APPROVAL_EFFECT: Record<PermitChangeType, { to: DataPermitStatus; newVersion: boolean }> = {
  AMENDMENT: { to: 'AMENDED', newVersion: true },
  RENEWAL: { to: 'RENEWED', newVersion: true },
  REVOCATION_APPEAL: { to: 'GRANTED', newVersion: true }, // revocation overturned → reinstated
};
