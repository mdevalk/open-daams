// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CompletenessCheckPanel } from './CompletenessCheckPanel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(cleanup);

beforeEach(() => {
  refresh.mockReset();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});

describe('CompletenessCheckPanel — fresh checklist (no existing check)', () => {
  it('renders the default items unchecked, with the PENDING badge', () => {
    render(<CompletenessCheckPanel applicationId="app-1" currentUserId="u-1" canManage={true} existing={null} />);

    expect(screen.getByText('resultPENDING')).toBeInTheDocument();
    expect(screen.getByText('items.title')).toBeInTheDocument();

    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(8); // DEFAULT_ITEM_KEYS
    checkboxes.forEach((cb) => expect(cb).not.toBeChecked());
    expect(screen.getByText('notAllChecked')).toBeInTheDocument();
  });

  it('toggles an item when its checkbox is clicked', () => {
    render(<CompletenessCheckPanel applicationId="app-1" currentUserId="u-1" canManage={true} existing={null} />);

    const firstCheckbox = document.querySelectorAll('input[type="checkbox"]')[0] as HTMLInputElement;
    expect(firstCheckbox).not.toBeChecked();
    fireEvent.click(firstCheckbox);
    expect(firstCheckbox).toBeChecked();
  });

  it('disables checkboxes and marks remarks read-only, and hides the mark-complete action, when canManage is false', () => {
    render(<CompletenessCheckPanel applicationId="app-1" currentUserId="u-1" canManage={false} existing={null} />);

    document.querySelectorAll('input[type="checkbox"]').forEach((cb) => expect(cb).toBeDisabled());
    expect(screen.getByLabelText('remarks')).toHaveAttribute('readonly');
    expect(screen.queryByText('markComplete')).not.toBeInTheDocument();
  });
});

describe('CompletenessCheckPanel — marking complete', () => {
  it('submits all items as a POST request and updates the badge to COMPLETE', async () => {
    render(<CompletenessCheckPanel applicationId="app-1" currentUserId="u-1" canManage={true} existing={null} />);

    document.querySelectorAll('input[type="checkbox"]').forEach((cb) => fireEvent.click(cb));

    fireEvent.click(screen.getByText('markComplete'));

    await waitFor(() => expect(screen.getByText('resultCOMPLETE')).toBeInTheDocument());
    expect(refresh).toHaveBeenCalled();

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/applications/app-1/completeness-check',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body.result).toBe('COMPLETE');
    expect(body.checkedById).toBe('u-1');
    expect(body.items).toHaveLength(8);
    expect(body.items.every((i: { passed: boolean }) => i.passed)).toBe(true);
  });
});

describe('CompletenessCheckPanel — existing check', () => {
  it('renders items and remarks from the existing check, and hides notAllChecked once it is no longer PENDING', () => {
    const existing = {
      items: [{ key: 'title', label: 'Title provided', passed: true }],
      result: 'COMPLETE',
      remarks: 'All good',
    };
    render(<CompletenessCheckPanel applicationId="app-1" currentUserId="u-1" canManage={true} existing={existing} />);

    expect(screen.getByText('Title provided')).toBeInTheDocument();
    expect(screen.getByDisplayValue('All good')).toBeInTheDocument();
    expect(screen.getByText('resultCOMPLETE')).toBeInTheDocument();
    expect(screen.queryByText('notAllChecked')).not.toBeInTheDocument();
  });
});
