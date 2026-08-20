// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { AppealsPanel } from './AppealsPanel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(cleanup);

type Appeals = ComponentProps<typeof AppealsPanel>['appeals'];

function makeAppeal(overrides: Partial<Appeals[number]> = {}): Appeals[number] {
  return {
    id: 'appeal-1',
    submittedAt: '2026-01-05T00:00:00.000Z',
    submittedBy: 'A. de Vries',
    grounds: 'Disagree with the decision',
    authority: null,
    status: 'SUBMITTED',
    decisionSummary: null,
    signedAt: null,
    attachments: [],
    ...overrides,
  } as unknown as Appeals[number];
}

beforeEach(() => {
  refresh.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

describe('AppealsPanel — read-only rendering', () => {
  it('shows the empty state when there are no appeals and canManage is false', () => {
    render(<AppealsPanel applicationId="app-1" appeals={[]} canManage={false} currentUserId="u-1" />);
    expect(screen.getByText('noneRegistered')).toBeInTheDocument();
    expect(screen.queryByText('+ register')).not.toBeInTheDocument();
  });

  it('renders an appeal with its status, grounds and submittedBy', () => {
    render(
      <AppealsPanel
        applicationId="app-1"
        appeals={[makeAppeal({ authority: 'Rechtbank Den Haag', decisionSummary: 'Upheld the original decision.' })]}
        canManage={false}
        currentUserId="u-1"
      />,
    );
    expect(screen.getByText('A. de Vries')).toBeInTheDocument();
    expect(screen.getByText('SUBMITTED')).toBeInTheDocument();
    expect(screen.getByText('Disagree with the decision')).toBeInTheDocument();
    expect(screen.getByText(/Rechtbank Den Haag/)).toBeInTheDocument();
    expect(screen.getByText('Upheld the original decision.')).toBeInTheDocument();
  });

  it('shows the decision PDF link only when signedAt is set', () => {
    const { rerender } = render(
      <AppealsPanel applicationId="app-1" appeals={[makeAppeal({ signedAt: null })]} canManage={false} currentUserId="u-1" />,
    );
    expect(screen.queryByText('downloadDecisionPdf')).not.toBeInTheDocument();

    rerender(
      <AppealsPanel
        applicationId="app-1"
        appeals={[makeAppeal({ signedAt: '2026-01-10T00:00:00.000Z' })]}
        canManage={false}
        currentUserId="u-1"
      />,
    );
    const link = screen.getByText('downloadDecisionPdf');
    expect(link).toHaveAttribute('href', '/api/appeals/appeal-1/pdf?userId=u-1');
  });

  it('lists attachments as download links', () => {
    render(
      <AppealsPanel
        applicationId="app-1"
        appeals={[makeAppeal({ attachments: [{ id: 'att-1', filename: 'evidence.pdf', mimeType: 'application/pdf' }] })]}
        canManage={false}
        currentUserId="u-1"
      />,
    );
    const link = screen.getByText(/evidence.pdf/);
    expect(link).toHaveAttribute('href', '/api/attachments/att-1?userId=u-1');
  });
});

describe('AppealsPanel — management actions (canManage)', () => {
  it('does not show status-transition buttons for a terminal-status appeal', () => {
    render(
      <AppealsPanel applicationId="app-1" appeals={[makeAppeal({ status: 'UPHELD' })]} canManage={true} currentUserId="u-1" />,
    );
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });

  it('shows the available next-status transitions for a SUBMITTED appeal', () => {
    render(
      <AppealsPanel applicationId="app-1" appeals={[makeAppeal({ status: 'SUBMITTED' })]} canManage={true} currentUserId="u-1" />,
    );
    expect(screen.getByText('→ UNDER_REVIEW')).toBeInTheDocument();
    expect(screen.getByText('→ WITHDRAWN')).toBeInTheDocument();
  });

  it('opens the registration form, submits it, and calls the appeals API with the entered fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    render(<AppealsPanel applicationId="app-1" appeals={[]} canManage={true} currentUserId="u-1" />);

    fireEvent.click(screen.getByText('+ register'));

    const submittedByInput = screen.getByText('submittedByLabel').parentElement!.querySelector('input')!;
    const groundsTextarea = screen.getByText('groundsLabel').parentElement!.querySelector('textarea')!;
    fireEvent.change(submittedByInput, { target: { value: 'A. de Vries' } });
    fireEvent.change(groundsTextarea, { target: { value: 'It was unfair' } });

    fireEvent.click(screen.getByText('register'));

    await waitFor(() => expect(refresh).toHaveBeenCalled());

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/applications/app-1/appeals',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ submittedBy: 'A. de Vries', grounds: 'It was unfair', authority: '', actingUserId: 'u-1' });
  });

  it('disables the register button until submittedBy and grounds are both filled', () => {
    render(<AppealsPanel applicationId="app-1" appeals={[]} canManage={true} currentUserId="u-1" />);
    fireEvent.click(screen.getByText('+ register'));
    const registerButton = screen.getByText('register').closest('button')!;
    expect(registerButton).toBeDisabled();

    const submittedByInput = screen.getByText('submittedByLabel').parentElement!.querySelector('input')!;
    fireEvent.change(submittedByInput, { target: { value: 'A. de Vries' } });
    expect(registerButton).toBeDisabled();
  });

  it('clicking a status transition calls PATCH on the appeal with the new status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    render(
      <AppealsPanel applicationId="app-1" appeals={[makeAppeal({ status: 'SUBMITTED' })]} canManage={true} currentUserId="u-1" />,
    );

    fireEvent.click(screen.getByText('→ UNDER_REVIEW'));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith('/api/appeals/appeal-1', expect.objectContaining({ method: 'PATCH' }));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ status: 'UNDER_REVIEW', actingUserId: 'u-1' });
  });

  it('shows the error message when the API call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Not allowed' }) }));
    render(
      <AppealsPanel applicationId="app-1" appeals={[makeAppeal({ status: 'SUBMITTED' })]} canManage={true} currentUserId="u-1" />,
    );

    fireEvent.click(screen.getByText('→ UNDER_REVIEW'));

    await waitFor(() => expect(screen.getByText('Not allowed')).toBeInTheDocument());
  });
});
