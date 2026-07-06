import { SpeProvisioningStatus, UserRole } from '@prisma/client';

export type SpeTransition = {
  to: SpeProvisioningStatus;
  label: string;
  requiredRole: UserRole[];
  description: string;
  requiresEnvironmentReference?: boolean;
};

// EHDS Art. 73 / TEHDAS2 D6.4 §9 — SPE provisioning lifecycle.
// REQUESTED → PROVISIONING → ACTIVE → DECOMMISSIONING → DECOMMISSIONED
// A request may also be cancelled directly to DECOMMISSIONED before going active.
export const SPE_TRANSITIONS: Record<SpeProvisioningStatus, SpeTransition[]> = {
  REQUESTED: [
    {
      to: 'PROVISIONING',
      label: 'Start provisioning',
      requiredRole: ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'],
      description: 'Hand off to the SPE operator to set up the environment.',
    },
    {
      to: 'DECOMMISSIONED',
      label: 'Cancel request',
      requiredRole: ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'],
      description: 'Cancel the provisioning request before work has started.',
    },
  ],
  PROVISIONING: [
    {
      to: 'ACTIVE',
      label: 'Mark environment active',
      requiredRole: ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'],
      description: 'The SPE is set up and ready for authorized persons to use.',
      requiresEnvironmentReference: true,
    },
    {
      to: 'DECOMMISSIONED',
      label: 'Cancel provisioning',
      requiredRole: ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'],
      description: 'Cancel provisioning before the environment went active.',
    },
  ],
  ACTIVE: [
    {
      to: 'DECOMMISSIONING',
      label: 'Request decommissioning',
      requiredRole: ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'],
      description: 'Typically triggered by permit revocation, expiry, or project completion.',
    },
  ],
  DECOMMISSIONING: [
    {
      to: 'DECOMMISSIONED',
      label: 'Confirm decommissioned',
      requiredRole: ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'],
      description: 'The SPE operator has confirmed the environment and its data have been removed.',
    },
  ],
  DECOMMISSIONED: [],
};

export const SPE_STATUS_LABELS: Record<SpeProvisioningStatus, string> = {
  REQUESTED: 'Requested',
  PROVISIONING: 'Provisioning',
  ACTIVE: 'Active',
  DECOMMISSIONING: 'Decommissioning',
  DECOMMISSIONED: 'Decommissioned',
};

export const SPE_STATUS_COLORS: Record<SpeProvisioningStatus, string> = {
  REQUESTED: 'bg-gray-100 text-gray-600',
  PROVISIONING: 'bg-blue-100 text-blue-700',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  DECOMMISSIONING: 'bg-amber-100 text-amber-700',
  DECOMMISSIONED: 'bg-red-100 text-red-700',
};
