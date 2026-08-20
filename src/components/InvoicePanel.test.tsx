// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { InvoicePanel } from './InvoicePanel';

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

describe('InvoicePanel — empty state', () => {
  it('shows the empty message and no "view invoices" link when there are no invoices', () => {
    render(
      <InvoicePanel
        permitId="permit-1"
        locale="nl"
        invoices={[]}
        canIssue={false}
        currentUserId="u-1"
        hasInvoiceableAmounts={false}
      />,
    );
    expect(screen.getByText('empty')).toBeInTheDocument();
    expect(screen.queryByText('viewPermitInvoices')).not.toBeInTheDocument();
  });
});

describe('InvoicePanel — invoice list', () => {
  it('links each invoice to its detail page and shows its status badge', () => {
    render(
      <InvoicePanel
        permitId="permit-1"
        locale="nl"
        invoices={[
          { id: 'inv-1', invoiceNumber: 'INV-2026-0001', status: 'DRAFT', dueAt: '2026-12-01' },
          { id: 'inv-2', invoiceNumber: 'INV-2026-0002', status: 'PAID', dueAt: '2026-12-01' },
        ]}
        canIssue={false}
        currentUserId="u-1"
        hasInvoiceableAmounts={false}
      />,
    );

    const draftLink = screen.getByText('INV-2026-0001');
    expect(draftLink).toHaveAttribute('href', '/nl/financials/inv-1');
    expect(screen.getByText('statusDRAFT')).toBeInTheDocument();
    expect(screen.getByText('statusPAID')).toBeInTheDocument();
    expect(screen.getByText('viewPermitInvoices')).toHaveAttribute(
      'href',
      '/nl/financials?tab=invoices&permitId=permit-1',
    );
  });

  it('shows "overdue" styling instead of the status badge for a past-due ISSUED invoice', () => {
    render(
      <InvoicePanel
        permitId="permit-1"
        locale="nl"
        invoices={[{ id: 'inv-3', invoiceNumber: 'INV-2026-0003', status: 'ISSUED', dueAt: '2020-01-01' }]}
        canIssue={false}
        currentUserId="u-1"
        hasInvoiceableAmounts={false}
      />,
    );
    expect(screen.getByText('overdue')).toHaveClass('bg-amber-100');
    expect(screen.queryByText('statusISSUED')).not.toBeInTheDocument();
  });

  it('does not show "overdue" for an ISSUED invoice that is not yet due', () => {
    render(
      <InvoicePanel
        permitId="permit-1"
        locale="nl"
        invoices={[{ id: 'inv-4', invoiceNumber: 'INV-2026-0004', status: 'ISSUED', dueAt: '2099-01-01' }]}
        canIssue={false}
        currentUserId="u-1"
        hasInvoiceableAmounts={false}
      />,
    );
    expect(screen.getByText('statusISSUED')).toBeInTheDocument();
    expect(screen.queryByText('overdue')).not.toBeInTheDocument();
  });
});

describe('InvoicePanel — issuing', () => {
  it('hides the issue button when canIssue is false', () => {
    render(
      <InvoicePanel
        permitId="permit-1"
        locale="nl"
        invoices={[]}
        canIssue={false}
        currentUserId="u-1"
        hasInvoiceableAmounts={true}
      />,
    );
    expect(screen.queryByText('issue')).not.toBeInTheDocument();
  });

  it('disables the issue button when there are no invoiceable amounts', () => {
    render(
      <InvoicePanel
        permitId="permit-1"
        locale="nl"
        invoices={[]}
        canIssue={true}
        currentUserId="u-1"
        hasInvoiceableAmounts={false}
      />,
    );
    expect(screen.getByText('issue')).toBeDisabled();
  });

  it('issues invoices and refreshes on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    render(
      <InvoicePanel
        permitId="permit-1"
        locale="nl"
        invoices={[]}
        canIssue={true}
        currentUserId="u-1"
        hasInvoiceableAmounts={true}
      />,
    );

    fireEvent.click(screen.getByText('issue'));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith('/api/permits/permit-1/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actingUserId: 'u-1' }),
    });
  });

  it('shows an error message when issuing fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'No invoiceable amounts' }) }),
    );

    render(
      <InvoicePanel
        permitId="permit-1"
        locale="nl"
        invoices={[]}
        canIssue={true}
        currentUserId="u-1"
        hasInvoiceableAmounts={true}
      />,
    );

    fireEvent.click(screen.getByText('issue'));
    expect(await screen.findByText('No invoiceable amounts')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
