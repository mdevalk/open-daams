import { ApplicationStatus, ApplicationType, UserRole } from '@prisma/client';

export type Transition = {
  to: ApplicationStatus;
  label: string;
  requiredRole: UserRole[];
  description: string;
};

/**
 * TEHDAS2 DAAMS state machine.
 * Defines valid transitions from each status and who can trigger them.
 */
export const TRANSITIONS: Record<ApplicationStatus, Transition[]> = {
  DRAFT: [
    {
      to: 'SUBMITTED',
      label: 'Submit application',
      requiredRole: ['APPLICANT'],
      description: 'Lodge the application with HDAB-NL. The 2-month statutory clock starts.',
    },
    {
      to: 'WITHDRAWN',
      label: 'Withdraw',
      requiredRole: ['APPLICANT'],
      description: 'Withdraw this draft application.',
    },
  ],
  SUBMITTED: [
    {
      to: 'ADMISSIBILITY_CHECK',
      label: 'Start admissibility check',
      requiredRole: ['CASE_HANDLER', 'ADMIN'],
      description: 'Begin the pre-screening completeness check.',
    },
    {
      to: 'WITHDRAWN',
      label: 'Mark as withdrawn',
      requiredRole: ['CASE_HANDLER', 'ADMIN', 'APPLICANT'],
      description: 'Withdraw the application at applicant request.',
    },
  ],
  ADMISSIBILITY_CHECK: [
    {
      to: 'INCOMPLETE',
      label: 'Return as incomplete',
      requiredRole: ['CASE_HANDLER', 'ADMIN'],
      description: 'Return to applicant — mandatory information missing. Applicant has 4 weeks to respond.',
    },
    {
      to: 'UNDER_ASSESSMENT',
      label: 'Declare admissible',
      requiredRole: ['CASE_HANDLER', 'ADMIN'],
      description: 'Application is complete. Proceed to substantive assessment.',
    },
    {
      to: 'INADMISSIBLE',
      label: 'Declare inadmissible',
      requiredRole: ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'],
      description: 'Application does not meet admissibility criteria. Reject at pre-screening.',
    },
  ],
  INCOMPLETE: [
    {
      to: 'SUBMITTED',
      label: 'Resubmit',
      requiredRole: ['APPLICANT'],
      description: 'Resubmit the application with the requested information.',
    },
    {
      to: 'WITHDRAWN',
      label: 'Withdraw',
      requiredRole: ['APPLICANT', 'CASE_HANDLER', 'ADMIN'],
      description: 'Withdraw due to non-response or applicant request.',
    },
  ],
  UNDER_ASSESSMENT: [
    {
      to: 'INFO_REQUESTED',
      label: 'Request additional information',
      requiredRole: ['CASE_HANDLER', 'ADMIN'],
      description: 'Pause assessment — additional clarification needed from applicant.',
    },
    {
      to: 'PERMIT_GRANTED',
      label: 'Grant data permit',
      requiredRole: ['DECISION_MAKER', 'ADMIN'],
      description: 'Issue a data permit (Art. 46 EHDS). Access will be provisioned.',
    },
    {
      to: 'PERMIT_REFUSED',
      label: 'Refuse permit',
      requiredRole: ['DECISION_MAKER', 'ADMIN'],
      description: 'Refuse the data access application with written reasons.',
    },
    {
      to: 'REQUEST_APPROVED',
      label: 'Approve data request',
      requiredRole: ['DECISION_MAKER', 'ADMIN'],
      description: 'Approve the Art. 69 data request for anonymised statistics.',
    },
    {
      to: 'REQUEST_REJECTED',
      label: 'Reject data request',
      requiredRole: ['DECISION_MAKER', 'ADMIN'],
      description: 'Reject the Art. 69 data request with written reasons.',
    },
  ],
  INFO_REQUESTED: [
    {
      to: 'UNDER_ASSESSMENT',
      label: 'Resume assessment',
      requiredRole: ['CASE_HANDLER', 'ADMIN'],
      description: 'Requested information received. Resume substantive assessment.',
    },
    {
      to: 'WITHDRAWN',
      label: 'Withdraw — no response',
      requiredRole: ['CASE_HANDLER', 'ADMIN'],
      description: 'Applicant did not respond within the given timeframe.',
    },
  ],
  PERMIT_GRANTED: [
    {
      to: 'DATA_PROVISIONING',
      label: 'Start data provisioning',
      requiredRole: ['CASE_HANDLER', 'DATA_HOLDER', 'ADMIN'],
      description: 'Begin preparing and transferring the dataset to the SPE.',
    },
  ],
  REQUEST_APPROVED: [
    {
      to: 'DATA_PROVISIONING',
      label: 'Start data provisioning',
      requiredRole: ['CASE_HANDLER', 'DATA_HOLDER', 'ADMIN'],
      description: 'Begin preparing the anonymised statistical output.',
    },
  ],
  DATA_PROVISIONING: [
    {
      to: 'ACTIVE',
      label: 'Activate — data access granted',
      requiredRole: ['CASE_HANDLER', 'DATA_HOLDER', 'ADMIN'],
      description: 'Dataset is available in the SPE. Access is now live.',
    },
  ],
  ACTIVE: [
    {
      to: 'COMPLETED',
      label: 'Close project',
      requiredRole: ['CASE_HANDLER', 'ADMIN'],
      description: 'Project period ended. Revoke SPE access and archive.',
    },
  ],
  // Terminal states — no further transitions
  PERMIT_REFUSED:    [],
  REQUEST_REJECTED:  [],
  INADMISSIBLE:      [],
  COMPLETED:         [],
  WITHDRAWN:         [],
};

export function getAvailableTransitions(
  currentStatus: ApplicationStatus,
  applicationType: ApplicationType,
  userRole: UserRole,
): Transition[] {
  const all = TRANSITIONS[currentStatus] ?? [];
  return all.filter((t) => {
    // For DATA_REQUEST type, hide permit-specific transitions
    if (applicationType === 'DATA_REQUEST') {
      if (t.to === 'PERMIT_GRANTED' || t.to === 'PERMIT_REFUSED') return false;
    }
    // For DATA_ACCESS_APPLICATION, hide request-specific transitions
    if (applicationType === 'DATA_ACCESS_APPLICATION') {
      if (t.to === 'REQUEST_APPROVED' || t.to === 'REQUEST_REJECTED') return false;
    }
    return t.requiredRole.includes(userRole);
  });
}

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  ADMISSIBILITY_CHECK: 'Admissibility check',
  INCOMPLETE: 'Incomplete',
  UNDER_ASSESSMENT: 'Under assessment',
  INFO_REQUESTED: 'Information requested',
  PERMIT_GRANTED: 'Permit granted',
  PERMIT_REFUSED: 'Permit refused',
  REQUEST_APPROVED: 'Request approved',
  REQUEST_REJECTED: 'Request rejected',
  DATA_PROVISIONING: 'Data provisioning',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  WITHDRAWN: 'Withdrawn',
  INADMISSIBLE: 'Inadmissible',
};

export const STATUS_COLORS: Record<ApplicationStatus, string> = {
  DRAFT:              'bg-gray-100 text-gray-700',
  SUBMITTED:          'bg-blue-100 text-blue-700',
  ADMISSIBILITY_CHECK:'bg-yellow-100 text-yellow-800',
  INCOMPLETE:         'bg-orange-100 text-orange-700',
  UNDER_ASSESSMENT:   'bg-indigo-100 text-indigo-700',
  INFO_REQUESTED:     'bg-amber-100 text-amber-700',
  PERMIT_GRANTED:     'bg-emerald-100 text-emerald-700',
  PERMIT_REFUSED:     'bg-red-100 text-red-700',
  REQUEST_APPROVED:   'bg-emerald-100 text-emerald-700',
  REQUEST_REJECTED:   'bg-red-100 text-red-700',
  DATA_PROVISIONING:  'bg-teal-100 text-teal-700',
  ACTIVE:             'bg-green-100 text-green-700',
  COMPLETED:          'bg-slate-100 text-slate-600',
  WITHDRAWN:          'bg-gray-100 text-gray-500',
  INADMISSIBLE:       'bg-red-100 text-red-700',
};

/** Returns true for statuses that represent a final/closed outcome */
export function isTerminal(status: ApplicationStatus): boolean {
  return ['PERMIT_REFUSED', 'REQUEST_REJECTED', 'INADMISSIBLE', 'COMPLETED', 'WITHDRAWN'].includes(status);
}

/** EHDS Art. 46: 2-month decision deadline, extendable by 2 months */
export function calculateDecisionDeadline(submittedAt: Date, extended = false): Date {
  const months = extended ? 4 : 2;
  const d = new Date(submittedAt);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** 4-week window for applicant to complete an incomplete application */
export function calculateIncompleteDeadline(sentBackAt: Date): Date {
  const d = new Date(sentBackAt);
  d.setDate(d.getDate() + 28);
  return d;
}

export function deadlineStatus(deadline: Date | null): 'ok' | 'warning' | 'overdue' | null {
  if (!deadline) return null;
  const now = Date.now();
  const ms = deadline.getTime() - now;
  const days = ms / 86_400_000;
  if (days < 0) return 'overdue';
  if (days < 14) return 'warning';
  return 'ok';
}
