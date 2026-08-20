// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NcpFetchForm } from './NcpFetchForm';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

afterEach(cleanup);

function entry(overrides: Record<string, unknown> = {}) {
  return {
    applicationId: 'ncp-app-1',
    title: 'Registry linkage study',
    version: 1,
    status: 'SUBMITTED',
    applicationType: 'DATA_ACCESS_APPLICATION',
    dateSubmitted: '2026-01-10T00:00:00Z',
    alreadyImported: null,
    ...overrides,
  };
}

describe('NcpFetchForm — loading the queue', () => {
  it('fetches the queue on mount and renders each entry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ entries: [entry()] }) }),
    );

    render(<NcpFetchForm actingUserId="u-1" />);

    await waitFor(() => expect(screen.getByText('Registry linkage study')).toBeInTheDocument());
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/import/ncp-queue');
    expect(screen.getByText(/pendingCount/)).toBeInTheDocument();
  });

  it('shows the load error when the queue request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Server unavailable' }) }),
    );

    render(<NcpFetchForm actingUserId="u-1" />);

    await waitFor(() => expect(screen.getByText('Server unavailable')).toBeInTheDocument());
  });

  it('shows the empty state once loaded with nothing queued', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ entries: [] }) }));

    render(<NcpFetchForm actingUserId="u-1" />);

    await waitFor(() => expect(screen.getByText('noneQueued')).toBeInTheDocument());
  });

  it('pre-populates the imported state for entries the server already knows were imported', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          entries: [entry({ alreadyImported: { id: 'app-existing', referenceNumber: 'HDAB-2026-0009' } })],
        }),
      }),
    );

    render(<NcpFetchForm actingUserId="u-1" />);

    await waitFor(() => expect(screen.getByText('HDAB-2026-0009', { exact: false })).toBeInTheDocument());
    expect(screen.getByText('imported')).toBeInTheDocument();
    expect(screen.getByText('imported')).toBeDisabled();
  });
});

describe('NcpFetchForm — importing an entry', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ entries: [entry()] }) }),
    );
  });

  it('imports an entry on success and shows the reference number with a link to it', async () => {
    render(<NcpFetchForm actingUserId="u-1" />);
    await waitFor(() => expect(screen.getByText('Registry linkage study')).toBeInTheDocument());

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ referenceNumber: 'HDAB-2026-0010', id: 'app-new' }),
    } as Response);

    fireEvent.click(screen.getByText('import'));

    await waitFor(() => expect(screen.getByText('HDAB-2026-0010')).toBeInTheDocument());
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith('/api/import/ncp-applications/ncp-app-1?userId=u-1', { method: 'POST' });
    const link = screen.getByText(/openApplication/).closest('a')!;
    expect(link).toHaveAttribute('href', '/applications/app-new');
  });

  it('shows the import error and offers a link to each failing attachment', async () => {
    render(<NcpFetchForm actingUserId="u-1" />);
    await waitFor(() => expect(screen.getByText('Registry linkage study')).toBeInTheDocument());

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Validation failed', attachments: ['application_metadata.json'] }),
    } as Response);

    fireEvent.click(screen.getByText('import'));

    await waitFor(() => expect(screen.getByText(/Validation failed/)).toBeInTheDocument());
    const attachmentLink = screen.getByText(/openFile/).closest('a')!;
    expect(attachmentLink).toHaveAttribute(
      'href',
      '/api/import/ncp-applications/ncp-app-1/attachments/application_metadata.json?userId=u-1',
    );
  });

  it('prefixes application links with the locale when one is given', async () => {
    render(<NcpFetchForm locale="nl" actingUserId="u-1" />);
    await waitFor(() => expect(screen.getByText('Registry linkage study')).toBeInTheDocument());

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ referenceNumber: 'HDAB-2026-0010', id: 'app-new' }),
    } as Response);

    fireEvent.click(screen.getByText('import'));

    await waitFor(() => expect(screen.getByText(/openApplication/)).toBeInTheDocument());
    const link = screen.getByText(/openApplication/).closest('a')!;
    expect(link).toHaveAttribute('href', '/nl/applications/app-new');
  });
});
