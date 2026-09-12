import type { UseCaseEntry } from '../types';

export const useCases: UseCaseEntry[] = [
  { id: 'request-data-extraction', name: 'Request a data extraction against a permit', satisfies: [], module: null },
  { id: 'decide-extraction-request', name: 'Approve/reject an extraction request', satisfies: [], module: null },
];
