// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { EthicalReviewPanel } from './EthicalReviewPanel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(cleanup);

type Application = ComponentProps<typeof EthicalReviewPanel>['application'];
type CurrentUser = ComponentProps<typeof EthicalReviewPanel>['currentUser'];

const CASE_HANDLER = { id: 'u-1', role: 'CASE_HANDLER', name: 'S. Bakker' } as unknown as CurrentUser;
const APPLICANT = { id: 'u-2', role: 'APPLICANT', name: 'A. de Vries' } as unknown as CurrentUser;

function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1',
    ethicalReviewRequired: false,
    ethicalReviewStatus: null,
    ethicalReviewBody: null,
    ethicalReviewReference: null,
    ethicalReviewDate: null,
    ...overrides,
  } as unknown as Application;
}

beforeEach(() => {
  refresh.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

describe('EthicalReviewPanel — display', () => {
  it('shows the notRequiredNote and NOT_REQUIRED badge when review is not required', () => {
    render(<EthicalReviewPanel application={makeApplication()} currentUser={CASE_HANDLER} />);
    expect(screen.getByText('notRequiredNote')).toBeInTheDocument();
    expect(screen.getByText('statusNOT_REQUIRED')).toBeInTheDocument();
  });

  it('shows committee/reference/date and status badge when review is required', () => {
    render(
      <EthicalReviewPanel
        application={makeApplication({
          ethicalReviewRequired: true,
          ethicalReviewStatus: 'APPROVED',
          ethicalReviewBody: 'METC Utrecht',
          ethicalReviewReference: 'REF-123',
        })}
        currentUser={CASE_HANDLER}
      />,
    );
    expect(screen.getByText('METC Utrecht')).toBeInTheDocument();
    expect(screen.getByText('REF-123')).toBeInTheDocument();
    expect(screen.getByText('statusAPPROVED')).toBeInTheDocument();
  });

  it('does not show an edit button for a non-manager role', () => {
    render(<EthicalReviewPanel application={makeApplication()} currentUser={APPLICANT} />);
    expect(screen.queryByText('edit')).not.toBeInTheDocument();
  });
});

describe('EthicalReviewPanel — editing', () => {
  it('enters edit mode, toggling the required checkbox reveals the detail fields', () => {
    render(<EthicalReviewPanel application={makeApplication()} currentUser={CASE_HANDLER} />);
    fireEvent.click(screen.getByText('edit'));
    // Detail fields hidden until "required" is checked.
    expect(screen.queryByText('statusLabel')).not.toBeInTheDocument();

    const checkbox = screen.getByText('requiredCheckbox').closest('label')!.querySelector('input')!;
    fireEvent.click(checkbox);
    expect(screen.getByText('statusLabel')).toBeInTheDocument();
  });

  it('saves edits via PATCH with the entered values and refreshes on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    render(<EthicalReviewPanel application={makeApplication()} currentUser={CASE_HANDLER} />);
    fireEvent.click(screen.getByText('edit'));

    const checkbox = screen.getByText('requiredCheckbox').closest('label')!.querySelector('input')!;
    fireEvent.click(checkbox);

    fireEvent.change(screen.getByDisplayValue('statusPENDING'), { target: { value: 'APPROVED' } });

    const committeeInput = screen.getByText('committee').parentElement!.querySelector('input')!;
    fireEvent.change(committeeInput, { target: { value: 'METC Utrecht' } });

    fireEvent.click(screen.getByText('save'));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/applications/app-1',
      expect.objectContaining({ method: 'PATCH' }),
    );
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual(
      expect.objectContaining({
        actingUserId: 'u-1',
        ethicalReviewRequired: true,
        ethicalReviewStatus: 'APPROVED',
        ethicalReviewBody: 'METC Utrecht',
      }),
    );
  });

  it('cancels edit mode without saving', () => {
    render(<EthicalReviewPanel application={makeApplication()} currentUser={CASE_HANDLER} />);
    fireEvent.click(screen.getByText('edit'));
    expect(screen.getByText('cancel')).toBeInTheDocument();
    fireEvent.click(screen.getByText('cancel'));
    expect(screen.queryByText('cancel')).not.toBeInTheDocument();
    expect(screen.getByText('edit')).toBeInTheDocument();
  });

  it('shows an error message when save fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Save broke' }) }));
    render(<EthicalReviewPanel application={makeApplication()} currentUser={CASE_HANDLER} />);
    fireEvent.click(screen.getByText('edit'));
    fireEvent.click(screen.getByText('save'));
    expect(await screen.findByText('Save broke')).toBeInTheDocument();
  });
});
