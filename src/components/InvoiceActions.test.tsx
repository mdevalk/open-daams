// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { InvoiceActions } from './InvoiceActions';

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
});

describe('InvoiceActions', () => {
  it('marks the invoice paid and refreshes on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    render(<InvoiceActions invoiceId="inv-1" currentUserId="u-1" />);
    fireEvent.click(screen.getByText('markPaid'));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith('/api/invoices/inv-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actingUserId: 'u-1', action: 'mark_paid' }),
    });
  });

  it('cancels the invoice and refreshes on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    render(<InvoiceActions invoiceId="inv-2" currentUserId="u-1" />);
    fireEvent.click(screen.getByText('cancelInvoice'));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith('/api/invoices/inv-2', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actingUserId: 'u-1', action: 'cancel' }),
    });
  });

  it('shows an error message and does not refresh when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Invoice already paid' }) }),
    );

    render(<InvoiceActions invoiceId="inv-3" currentUserId="u-1" />);
    fireEvent.click(screen.getByText('markPaid'));

    expect(await screen.findByText('Invoice already paid')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
