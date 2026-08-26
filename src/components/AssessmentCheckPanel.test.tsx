// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AssessmentCheckPanel } from './AssessmentCheckPanel';

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

describe('AssessmentCheckPanel — fresh checklist (no existing check)', () => {
  it('renders the default items unchecked, with the PENDING badge', () => {
    render(<AssessmentCheckPanel applicationId="app-1" currentUserId="u-1" canManage={true} existing={null} />);

    expect(screen.getByText('resultPENDING')).toBeInTheDocument();
    expect(screen.getByText('items.eligibleApplicant')).toBeInTheDocument();

    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(8); // DEFAULT_ITEM_KEYS
    checkboxes.forEach((cb) => expect(cb).not.toBeChecked());
    expect(screen.getByText('notAllChecked')).toBeInTheDocument();
  });

  it('toggles an item when its checkbox is clicked', () => {
    render(<AssessmentCheckPanel applicationId="app-1" currentUserId="u-1" canManage={true} existing={null} />);

    const firstCheckbox = document.querySelectorAll('input[type="checkbox"]')[0] as HTMLInputElement;
    expect(firstCheckbox).not.toBeChecked();
    fireEvent.click(firstCheckbox);
    expect(firstCheckbox).toBeChecked();
  });

  it('starts collapsed when canManage is false, and expanding shows disabled checkboxes, read-only remarks, and no mark-complete action', () => {
    render(<AssessmentCheckPanel applicationId="app-1" currentUserId="u-1" canManage={false} existing={null} />);

    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    fireEvent.click(screen.getByText('title'));

    document.querySelectorAll('input[type="checkbox"]').forEach((cb) => expect(cb).toBeDisabled());
    expect(screen.getByLabelText('remarks')).toHaveAttribute('readonly');
    expect(screen.queryByText('markComplete')).not.toBeInTheDocument();
  });
});

describe('AssessmentCheckPanel — collapsing', () => {
  it('auto-collapses when canManage flips to false (e.g. after a decision is issued)', () => {
    const existing = {
      items: [{ key: 'eligibleApplicant', label: 'Applicant is eligible', passed: true }],
      result: 'COMPLETE',
      remarks: 'All good',
    };
    const { rerender } = render(
      <AssessmentCheckPanel applicationId="app-1" currentUserId="u-1" canManage={true} existing={existing} />,
    );
    expect(screen.getByText('Applicant is eligible')).toBeInTheDocument();

    rerender(<AssessmentCheckPanel applicationId="app-1" currentUserId="u-1" canManage={false} existing={existing} />);
    expect(screen.queryByText('Applicant is eligible')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('title'));
    expect(screen.getByText('Applicant is eligible')).toBeInTheDocument();
  });
});

describe('AssessmentCheckPanel — marking complete', () => {
  it('submits all items as a POST request and updates the badge to COMPLETE', async () => {
    render(<AssessmentCheckPanel applicationId="app-1" currentUserId="u-1" canManage={true} existing={null} />);

    document.querySelectorAll('input[type="checkbox"]').forEach((cb) => fireEvent.click(cb));

    fireEvent.click(screen.getByText('markComplete'));

    await waitFor(() => expect(screen.getByText('resultCOMPLETE')).toBeInTheDocument());
    expect(refresh).toHaveBeenCalled();

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/applications/app-1/assessment-check',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body.result).toBe('COMPLETE');
    expect(body.checkedById).toBe('u-1');
    expect(body.items).toHaveLength(8);
    expect(body.items.every((i: { passed: boolean }) => i.passed)).toBe(true);
  });

  it('disables the mark-complete button once the result is COMPLETE, preventing duplicate submits', async () => {
    render(<AssessmentCheckPanel applicationId="app-1" currentUserId="u-1" canManage={true} existing={null} />);

    document.querySelectorAll('input[type="checkbox"]').forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByText('markComplete'));
    await waitFor(() => expect(screen.getByText('resultCOMPLETE')).toBeInTheDocument());

    expect(screen.getByText('markComplete')).toBeDisabled();
    const fetchMock = vi.mocked(fetch);
    fireEvent.click(screen.getByText('markComplete'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('AssessmentCheckPanel — existing check', () => {
  it('renders items and remarks from the existing check, and hides notAllChecked once it is no longer PENDING', () => {
    const existing = {
      items: [{ key: 'eligibleApplicant', label: 'Applicant is eligible', passed: true }],
      result: 'COMPLETE',
      remarks: 'All good',
    };
    render(<AssessmentCheckPanel applicationId="app-1" currentUserId="u-1" canManage={true} existing={existing} />);

    expect(screen.getByText('Applicant is eligible')).toBeInTheDocument();
    expect(screen.getByDisplayValue('All good')).toBeInTheDocument();
    expect(screen.getByText('resultCOMPLETE')).toBeInTheDocument();
    expect(screen.queryByText('notAllChecked')).not.toBeInTheDocument();
  });
});
