import type { UseCaseEntry } from '../types';

export const useCases: UseCaseEntry[] = [
  { id: 'issue-initial-permit', name: 'Issue initial permit', satisfies: [], module: null },
  {
    id: 'request-permit-change',
    name: 'Request a permit change (amendment/renewal/revocation-appeal)',
    satisfies: [],
    module: null,
  },
  { id: 'approve-permit-change', name: 'Approve a permit change request', satisfies: [], module: null },
  { id: 'reject-permit-change', name: 'Reject a permit change request', satisfies: [], module: null },
  { id: 'activate-permit-version', name: 'Activate a permit version', satisfies: [], module: null },
  { id: 'provision-spe', name: 'Provision/deprovision an SPE for a permit', satisfies: [], module: null },
];
