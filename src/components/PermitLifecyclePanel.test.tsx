// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PermitLifecyclePanel } from './PermitLifecyclePanel';

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
  vi.stubGlobal('fetch', vi.fn());
});

describe('PermitLifecyclePanel — availability', () => {
  it('renders nothing for a terminal permit status (REVOKED)', () => {
    const { container } = render(
      <PermitLifecyclePanel permitId="p-1" permitStatus="REVOKED" currentUserId="u-1" currentUserRole="ADMIN" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the current user role has no matching transition', () => {
    const { container } = render(
      <PermitLifecyclePanel permitId="p-1" permitStatus="GRANTED" currentUserId="u-1" currentUserRole="APPLICANT" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows only the EXPIRE transition for a CASE_HANDLER (REVOKE requires DECISION_MAKER/ADMIN)', () => {
    render(<PermitLifecyclePanel permitId="p-1" permitStatus="GRANTED" currentUserId="u-1" currentUserRole="CASE_HANDLER" />);
    expect(screen.getByText('expire')).toBeInTheDocument();
    expect(screen.queryByText('revoke')).not.toBeInTheDocument();
  });

  it('shows both REVOKE and EXPIRE for an ADMIN', () => {
    render(<PermitLifecyclePanel permitId="p-1" permitStatus="GRANTED" currentUserId="u-1" currentUserRole="ADMIN" />);
    expect(screen.getByText('expire')).toBeInTheDocument();
    expect(screen.getByText('revoke')).toBeInTheDocument();
  });
});

describe('PermitLifecyclePanel — selecting a transition', () => {
  it('selecting EXPIRE shows a comment field and enables confirm without any text', () => {
    render(<PermitLifecyclePanel permitId="p-1" permitStatus="GRANTED" currentUserId="u-1" currentUserRole="ADMIN" />);
    fireEvent.click(screen.getByText('expire'));
    expect(screen.getByText('comment')).toBeInTheDocument();
    const confirmButton = screen.getByText('confirm: EXPIRED').closest('button')!;
    expect(confirmButton).not.toBeDisabled();
  });

  it('selecting REVOKE requires a non-empty reason before the confirm button is enabled', () => {
    render(<PermitLifecyclePanel permitId="p-1" permitStatus="GRANTED" currentUserId="u-1" currentUserRole="ADMIN" />);
    fireEvent.click(screen.getByText('revoke'));
    expect(screen.getByText('revocationReason')).toBeInTheDocument();
    const confirmButton = screen.getByText('confirm: REVOKED').closest('button')!;
    expect(confirmButton).toBeDisabled();

    const textarea = screen.getByPlaceholderText('revocationPlaceholder');
    fireEvent.change(textarea, { target: { value: 'Data breach discovered' } });
    expect(confirmButton).not.toBeDisabled();
  });

  it('clicking the selected transition button again collapses the form', () => {
    render(<PermitLifecyclePanel permitId="p-1" permitStatus="GRANTED" currentUserId="u-1" currentUserRole="ADMIN" />);
    fireEvent.click(screen.getByText('expire'));
    expect(screen.getByText('comment')).toBeInTheDocument();
    fireEvent.click(screen.getByText('expire'));
    expect(screen.queryByText('comment')).not.toBeInTheDocument();
  });
});

describe('PermitLifecyclePanel — confirming a transition', () => {
  it('POSTs the toStatus, actingUserId, and revoke reason as comment for REVOKED', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    render(<PermitLifecyclePanel permitId="p-1" permitStatus="GRANTED" currentUserId="u-1" currentUserRole="ADMIN" />);

    fireEvent.click(screen.getByText('revoke'));
    fireEvent.change(screen.getByPlaceholderText('revocationPlaceholder'), { target: { value: 'Data breach discovered' } });
    fireEvent.click(screen.getByText('confirm: REVOKED'));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith('/api/permits/p-1', expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ toStatus: 'REVOKED', actingUserId: 'u-1', comment: 'Data breach discovered' });
  });

  it('shows an error message when the API call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Not allowed' }) }));
    render(<PermitLifecyclePanel permitId="p-1" permitStatus="GRANTED" currentUserId="u-1" currentUserRole="ADMIN" />);

    fireEvent.click(screen.getByText('expire'));
    fireEvent.click(screen.getByText('confirm: EXPIRED'));

    await waitFor(() => expect(screen.getByText('Not allowed')).toBeInTheDocument());
  });
});
