import { ApplicationStatus, ApplicationType, UserRole } from '@prisma/client';

export type Transition = {
  to: ApplicationStatus;
  label: string;
  requiredRole: UserRole[];
  description: string;
  requiresDecisionOutcome?: 'POSITIVE' | 'NEGATIVE';
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
      label: 'Submit application',
      requiredRole: ['APPLICANT'],
      description: 'Lodge the application with HDAB-NL. The statutory clock starts on receipt.',
    },
    {
      to: 'WITHDRAWN',
      label: 'Withdraw draft',
      requiredRole: ['APPLICANT'],
      description: 'Discard this draft without submitting.',
    },
  ],

  SUBMITTED: [
    {
      to: 'PRE_SCREENING',
      label: 'Start pre-screening',
      requiredRole: ['CASE_HANDLER', 'ADMIN'],
      description: 'Begin the pre-screening completeness check (TEHDAS2 D6.4 Fig. 1/2).',
    },
    {
      to: 'WITHDRAWN',
      label: 'Mark as withdrawn',
      requiredRole: ['APPLICANT', 'CASE_HANDLER', 'ADMIN'],
      description: 'Applicant withdraws the application.',
    },
  ],

  PRE_SCREENING: [
    {
      to: 'AWAITING_ADDITIONAL_INFORMATION',
      label: 'Request additional information',
      requiredRole: ['CASE_HANDLER', 'ADMIN'],
      // D6.4 §8: decision deadline is voided when this transition is taken
      description: 'HDAB requests additional information. Decision clock is paused (D6.4 §8).',
    },
    {
      to: 'PROCESSING',
      label: 'Complete pre-screening — proceed to processing',
      requiredRole: ['CASE_HANDLER', 'ADMIN'],
      description: 'HDAB completes pre-screening; application proceeds to substantive processing (D6.4 Fig. 1/2).',
    },
    {
      to: 'WITHDRAWN',
      label: 'Mark as withdrawn',
      requiredRole: ['APPLICANT', 'CASE_HANDLER', 'ADMIN'],
      description: 'Applicant withdraws the application.',
    },
  ],

  AWAITING_ADDITIONAL_INFORMATION: [
    {
      to: 'PRE_SCREENING',
      label: 'Additional information received — resume pre-screening',
      requiredRole: ['CASE_HANDLER', 'ADMIN'],
      // D6.4 §8: deadline recalculated from timestamp of additional info receipt
      description: 'Applicant submitted additional information; pre-screening resumes. Decision clock recalculated (D6.4 §8).',
    },
    {
      to: 'DECISION_ISSUED',
      label: 'Issue negative decision — no response received',
      requiredRole: ['DECISION_MAKER', 'ADMIN'],
      description: 'Applicant did not submit additional information within the deadline (D6.4 Fig. 1/2).',
      requiresDecisionOutcome: 'NEGATIVE',
    },
    {
      to: 'WITHDRAWN',
      label: 'Mark as withdrawn',
      requiredRole: ['APPLICANT', 'CASE_HANDLER', 'ADMIN'],
      description: 'Applicant withdraws the application.',
    },
  ],

  PROCESSING: [
    {
      to: 'DECISION_ISSUED',
      label: 'Issue positive decision',
      requiredRole: ['DECISION_MAKER', 'ADMIN'],
      description: 'HDAB takes a positive decision on the application (D6.4 Fig. 1/2).',
      requiresDecisionOutcome: 'POSITIVE',
    },
    {
      to: 'DECISION_ISSUED',
      label: 'Issue negative decision',
      requiredRole: ['DECISION_MAKER', 'ADMIN'],
      description: 'HDAB takes a negative decision on the application (D6.4 Fig. 1/2).',
      requiresDecisionOutcome: 'NEGATIVE',
    },
    {
      to: 'WITHDRAWN',
      label: 'Mark as withdrawn',
      requiredRole: ['APPLICANT', 'CASE_HANDLER', 'ADMIN'],
      description: 'Applicant withdraws the application.',
    },
  ],

  // Terminal — no further application transitions.
  // A positive DECISION_ISSUED creates a DataPermit with its own lifecycle.
  DECISION_ISSUED: [],
  WITHDRAWN:       [],
};

export function getAvailableTransitions(
  currentStatus: ApplicationStatus,
  _applicationType: ApplicationType,
  userRole: UserRole,
): Transition[] {
  return (TRANSITIONS[currentStatus] ?? []).filter((t) => t.requiredRole.includes(userRole));
}

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  DRAFT:                           'Draft',
  SUBMITTED:                       'Submitted',
  PRE_SCREENING:                   'Pre-screening',
  AWAITING_ADDITIONAL_INFORMATION: 'Awaiting additional information',
  PROCESSING:                      'Processing',
  DECISION_ISSUED:                 'Decision issued',
  WITHDRAWN:                       'Withdrawn',
};

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

export function calculateDecisionDeadline(from: Date, extended = false): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + (extended ? 4 : 2));
  return d;
}

export function calculateAdditionalInfoDeadline(requestedAt: Date): Date {
  const d = new Date(requestedAt);
  d.setDate(d.getDate() + 28); // ~1 month per D6.4 §6
  return d;
}

export function deadlineStatus(deadline: Date | null | undefined): 'ok' | 'warning' | 'overdue' | null {
  if (!deadline) return null;
  const days = (new Date(deadline).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return 'overdue';
  if (days < 14) return 'warning';
  return 'ok';
}
