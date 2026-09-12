import type { UseCaseEntry } from '../types';

export const useCases: UseCaseEntry[] = [
  { id: 'create-fee-estimate', name: 'Create a fee estimate', satisfies: [], module: null },
  { id: 'decide-fee-estimate', name: 'Accept/reject a fee estimate', satisfies: [], module: null },
  { id: 'generate-provisional-invoice', name: 'Generate a provisional invoice', satisfies: [], module: null },
  { id: 'issue-permit-invoice', name: 'Issue a permit invoice', satisfies: [], module: null },
  { id: 'update-invoice-status', name: 'Update invoice/payment status', satisfies: [], module: null },
];
