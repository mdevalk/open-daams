import type { CapabilityDefinition } from './types';

export const capabilities: CapabilityDefinition[] = [
  {
    id: 'application-lifecycle',
    name: 'Application lifecycle',
    description:
      'Intake, screening, assessment, and decisioning of a data access/request application through to a positive or negative decision.',
  },
  {
    id: 'fee-invoicing',
    name: 'Fee & invoicing',
    description: 'Estimating, accepting, and invoicing the fees an applicant owes across the application and permit lifecycle (Art. 62 EHDS).',
  },
  {
    id: 'permit-lifecycle',
    name: 'Permit lifecycle',
    description: 'Issuing, amending, renewing, activating, and revoking a granted data permit as an append-only version chain.',
  },
  {
    id: 'appeals',
    name: 'Appeals',
    description: "Handling an applicant's appeal against a negative or partial decision.",
  },
  {
    id: 'data-access-execution',
    name: 'Data access execution',
    description: 'Requesting and approving the actual extraction of data against an issued permit.',
  },
  {
    id: 'external-ingestion',
    name: 'External ingestion',
    description: 'Importing applications and payloads from external HealthData@EU/NCP sources into the DAAMS.',
  },
];
