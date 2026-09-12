import { describe, it, expect } from 'vitest';
import { isDeadlineExtensionHidden, deadlineExtensionViewState } from '@/lib/capabilities/application-lifecycle/deadline-extension';

describe('isDeadlineExtensionHidden', () => {
  it('hides on a final status regardless of role or extension state', () => {
    expect(isDeadlineExtensionHidden('DECISION_ISSUED', true, true)).toBe(true);
    expect(isDeadlineExtensionHidden('WITHDRAWN', false, false)).toBe(true);
  });

  it('hides for a non-manager when no extension has been granted', () => {
    expect(isDeadlineExtensionHidden('PROCESSING', false, false)).toBe(true);
  });

  it('shows for a non-manager once an extension has been granted', () => {
    expect(isDeadlineExtensionHidden('PROCESSING', false, true)).toBe(false);
  });

  it('shows for a manager regardless of extension state', () => {
    expect(isDeadlineExtensionHidden('PROCESSING', true, false)).toBe(false);
    expect(isDeadlineExtensionHidden('PROCESSING', true, true)).toBe(false);
  });
});

describe('deadlineExtensionViewState', () => {
  it('returns "extended" once the deadline is extended, regardless of role', () => {
    expect(deadlineExtensionViewState({ deadlineExtended: true, canManage: false, editing: false, embedded: false })).toBe('extended');
    expect(deadlineExtensionViewState({ deadlineExtended: true, canManage: true, editing: true, embedded: false })).toBe('extended');
  });

  it('returns "hidden" for a non-manager with no extension', () => {
    expect(deadlineExtensionViewState({ deadlineExtended: false, canManage: false, editing: false, embedded: false })).toBe('hidden');
  });

  it('returns "editing" for a manager mid-edit', () => {
    expect(deadlineExtensionViewState({ deadlineExtended: false, canManage: true, editing: true, embedded: false })).toBe('editing');
  });

  it('returns "embedded-prompt" for a manager, not editing, embedded', () => {
    expect(deadlineExtensionViewState({ deadlineExtended: false, canManage: true, editing: false, embedded: true })).toBe('embedded-prompt');
  });

  it('returns "prompt" for a manager, not editing, not embedded', () => {
    expect(deadlineExtensionViewState({ deadlineExtended: false, canManage: true, editing: false, embedded: false })).toBe('prompt');
  });
});
