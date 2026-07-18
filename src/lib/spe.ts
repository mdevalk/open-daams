import { SpeProvisioningStatus, UserRole } from '@prisma/client';

export type SpeTransition = {
  to: SpeProvisioningStatus;
  // i18n keys in the `speTransitions` namespace (label + label+'Desc' description)
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
      label: 'startProvisioning',
      requiredRole: ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'],
      description: 'startProvisioningDesc',
    },
    {
      to: 'DECOMMISSIONED',
      label: 'cancelRequest',
      requiredRole: ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'],
      description: 'cancelRequestDesc',
    },
  ],
  PROVISIONING: [
    {
      to: 'ACTIVE',
      label: 'markActive',
      requiredRole: ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'],
      description: 'markActiveDesc',
      requiresEnvironmentReference: true,
    },
    {
      to: 'DECOMMISSIONED',
      label: 'cancelProvisioning',
      requiredRole: ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'],
      description: 'cancelProvisioningDesc',
    },
  ],
  ACTIVE: [
    {
      to: 'DECOMMISSIONING',
      label: 'requestDecommission',
      requiredRole: ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'],
      description: 'requestDecommissionDesc',
    },
  ],
  DECOMMISSIONING: [
    {
      to: 'DECOMMISSIONED',
      label: 'confirmDecommissioned',
      requiredRole: ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'],
      description: 'confirmDecommissionedDesc',
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
