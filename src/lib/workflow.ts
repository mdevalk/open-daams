import { ApplicationStatus, ApplicationType, UserRole, DecisionTrack } from '@prisma/client';
import nlMessages from '../../messages/nl.json';

export type Transition = {
  to: ApplicationStatus;
  // Key into the `workflowTransitions` message namespace (`<key>.label` /
  // `<key>.description`) — not literal text, so the UI can render it in the
  // viewer's locale instead of always Dutch.
  key: string;
  requiredRole: UserRole[];
  requiresDecisionOutcome?: 'POSITIVE' | 'NEGATIVE';
  // A positive decision commits HDAB-NL to granting the permit whose cost
  // was estimated — only meaningful alongside requiresDecisionOutcome:
  // 'POSITIVE'; a refusal has no such commitment.
  requiresFeeEstimateAccepted?: boolean;
};

/**
 * TEHDAS2 D6.4 Figures 1 & 2 — state machine for both Data Access Applications
 * and Data Requests (diagrams are identical).
 *
 * Application states: SUBMITTED → PRE_SCREENING ⇆ AWAITING_ADDITIONAL_INFORMATION
 *                     PRE_SCREENING → PROCESSING → DECISION_ISSUED (POSITIVE|NEGATIVE)
 *                     AWAITING_ADDITIONAL_INFORMATION → DECISION_ISSUED (no response)
 *                     Any active state → WITHDRAWN
 *
 * DRAFT is a pre-submission state required by D6.4 §6 (applicant workspace) but
 * not shown in the state machine diagrams.
 *
 * After a positive DECISION_ISSUED a DataPermit is created with its own lifecycle
 * (D6.4 §9.2): GRANTED → AMENDED | RENEWED | REVOKED | EXPIRED.
 * That lifecycle is managed separately via /api/permits/[id]/.
 */
export const TRANSITIONS: Record<ApplicationStatus, Transition[]> = {
  DRAFT: [
    {
      to: 'SUBMITTED',
      key: 'submit',
      requiredRole: ['APPLICANT'],
    },
    {
      to: 'WITHDRAWN',
      key: 'withdrawDraft',
      requiredRole: ['APPLICANT'],
    },
  ],

  SUBMITTED: [
    {
      to: 'PRE_SCREENING',
      key: 'startPreScreening',
      requiredRole: ['CASE_HANDLER', 'ADMIN'],
    },
    {
      to: 'WITHDRAWN',
      key: 'withdraw',
      requiredRole: ['APPLICANT', 'CASE_HANDLER', 'ADMIN'],
    },
  ],

  PRE_SCREENING: [
    {
      to: 'AWAITING_ADDITIONAL_INFORMATION',
      key: 'requestAdditionalInfo',
      requiredRole: ['CASE_HANDLER', 'ADMIN'],
      // D6.4 §8: decision deadline is voided when this transition is taken
    },
    {
      to: 'PROCESSING',
      key: 'completePreScreening',
      requiredRole: ['CASE_HANDLER', 'ADMIN'],
    },
    {
      to: 'WITHDRAWN',
      key: 'withdraw',
      requiredRole: ['APPLICANT', 'CASE_HANDLER', 'ADMIN'],
    },
  ],

  AWAITING_ADDITIONAL_INFORMATION: [
    {
      to: 'PRE_SCREENING',
      key: 'resumePreScreening',
      // D6.4 §6: "updated information MUST be transmitted to the HDAB" — the
      // applicant initiates this by submitting their response; CASE_HANDLER/ADMIN
      // can also record receipt on their behalf.
      requiredRole: ['APPLICANT', 'CASE_HANDLER', 'ADMIN'],
      // D6.4 §8: deadline recalculated from timestamp of additional info receipt
    },
    {
      to: 'DECISION_ISSUED',
      key: 'autoNegativeNoResponse',
      requiredRole: ['DECISION_MAKER', 'ADMIN'],
      requiresDecisionOutcome: 'NEGATIVE',
    },
    {
      to: 'WITHDRAWN',
      key: 'withdraw',
      requiredRole: ['APPLICANT', 'CASE_HANDLER', 'ADMIN'],
    },
  ],

  PROCESSING: [
    {
      to: 'DECISION_ISSUED',
      key: 'positiveDecision',
      requiredRole: ['DECISION_MAKER', 'ADMIN'],
      requiresDecisionOutcome: 'POSITIVE',
      requiresFeeEstimateAccepted: true,
    },
    {
      to: 'DECISION_ISSUED',
      key: 'negativeDecision',
      requiredRole: ['DECISION_MAKER', 'ADMIN'],
      requiresDecisionOutcome: 'NEGATIVE',
    },
    {
      to: 'WITHDRAWN',
      key: 'withdraw',
      requiredRole: ['APPLICANT', 'CASE_HANDLER', 'ADMIN'],
    },
  ],

  // Terminal — no further application transitions.
  // A positive DECISION_ISSUED creates a DataPermit with its own lifecycle.
  DECISION_ISSUED: [],
  WITHDRAWN:       [],
};

// ApplicationLog.action is a persisted, point-in-time audit record — like
// permit content and the issued PDF (see CLAUDE.md), it stays in the issuing
// HDAB's own operating language regardless of the viewer's locale, rather
// than being retroactively re-rendered per-viewer. This is the one place a
// transition's label is still needed as literal text server-side.
export function transitionLogLabel(key: string): string {
  const entry = (nlMessages.workflowTransitions as Record<string, { label: string }>)[key];
  return entry?.label ?? key;
}

export function getAvailableTransitions(
  currentStatus: ApplicationStatus,
  _applicationType: ApplicationType,
  userRole: UserRole,
  feeEstimateAccepted: boolean,
): Transition[] {
  return (TRANSITIONS[currentStatus] ?? []).filter(
    (t) => t.requiredRole.includes(userRole) && (!t.requiresFeeEstimateAccepted || feeEstimateAccepted),
  );
}

export const STATUS_COLORS: Record<ApplicationStatus, string> = {
  DRAFT:                           'bg-gray-100 text-gray-700',
  SUBMITTED:                       'bg-blue-100 text-blue-700',
  PRE_SCREENING:                   'bg-yellow-100 text-yellow-800',
  AWAITING_ADDITIONAL_INFORMATION: 'bg-orange-100 text-orange-700',
  PROCESSING:                      'bg-indigo-100 text-indigo-700',
  DECISION_ISSUED:                 'bg-emerald-100 text-emerald-700',
  WITHDRAWN:                       'bg-gray-100 text-gray-500',
};

export function isTerminal(status: ApplicationStatus): boolean {
  return status === 'DECISION_ISSUED' || status === 'WITHDRAWN';
}

// EHDS Art. 68: the applicable decision deadline depends on the applicant.
// STANDARD applicants get 3 months, extendable by 3 (total 6); EXPEDITED
// (public-sector bodies / Union institutions under a public-health or policy
// mandate) get 2 months, extendable by 1 (total 3).
const DECISION_DEADLINE_MONTHS: Record<DecisionTrack, { base: number; extended: number }> = {
  STANDARD:  { base: 3, extended: 6 },
  EXPEDITED: { base: 2, extended: 3 },
};

export function calculateDecisionDeadline(
  from: Date,
  track: DecisionTrack = 'STANDARD',
  extended = false,
): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + DECISION_DEADLINE_MONTHS[track][extended ? 'extended' : 'base']);
  return d;
}

export function calculateAdditionalInfoDeadline(requestedAt: Date): Date {
  const d = new Date(requestedAt);
  d.setDate(d.getDate() + 28); // ~1 month per D6.4 §6
  return d;
}

export function calculatePermitAcceptanceDeadline(sentAt: Date): Date {
  const d = new Date(sentAt);
  d.setDate(d.getDate() + 28); // D6.4 R9.2.6 — same 28-day window as HealthData@EU
  return d;
}

export function deadlineStatus(deadline: Date | null | undefined): 'ok' | 'warning' | 'overdue' | null {
  if (!deadline) return null;
  const days = (new Date(deadline).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return 'overdue';
  if (days < 14) return 'warning';
  return 'ok';
}
