const FINAL_STATUSES = ['DECISION_ISSUED', 'WITHDRAWN'];

export function isDeadlineExtensionHidden(status: string, canManage: boolean, deadlineExtended: boolean): boolean {
  if (FINAL_STATUSES.includes(status)) return true;
  return !canManage && !deadlineExtended;
}

export type DeadlineExtensionViewState = 'extended' | 'editing' | 'embedded-prompt' | 'prompt' | 'hidden';

export function deadlineExtensionViewState(params: {
  deadlineExtended: boolean;
  canManage: boolean;
  editing: boolean;
  embedded: boolean;
}): DeadlineExtensionViewState {
  if (params.deadlineExtended) return 'extended';
  if (!params.canManage) return 'hidden';
  if (params.editing) return 'editing';
  return params.embedded ? 'embedded-prompt' : 'prompt';
}
