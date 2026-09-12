import type { UseCaseEntry } from '../types';

export const useCases: UseCaseEntry[] = [
  {
    id: 'complete-pre-screening-check',
    name: 'Complete pre-screening check',
    satisfies: ['R7.2.1', 'R7.2.2', 'R7.2.4', 'R7.2.6'],
    module: './checklist-checks',
  },
  {
    id: 'complete-substantive-assessment',
    name: 'Complete substantive assessment',
    satisfies: ['R7.3.1', 'R7.3.3', 'R7.3.4', 'R7.3.7'],
    module: './checklist-checks',
  },
  { id: 'submit-application', name: 'Submit application', satisfies: [], module: null },
  { id: 'request-additional-information', name: 'Request additional information', satisfies: [], module: null },
  { id: 'resume-processing', name: 'Resume processing after additional info received', satisfies: [], module: null },
  { id: 'extend-decision-deadline', name: 'Extend the decision deadline', satisfies: [], module: null },
  { id: 'issue-decision', name: 'Issue decision (positive/negative)', satisfies: [], module: null },
  { id: 'withdraw-application', name: 'Withdraw application', satisfies: [], module: null },
  { id: 'assign-trusted-data-holder', name: 'Assign a trusted data holder', satisfies: [], module: null },
];
