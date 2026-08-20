// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { ExtractionRequestsPanel } from './ExtractionRequestsPanel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(cleanup);

type Requests = ComponentProps<typeof ExtractionRequestsPanel>['requests'];

const DATA_HOLDERS = [{ id: 'dh-1', name: 'GP Information Network (LINH)' }];

beforeEach(() => {
  refresh.mockReset();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    status: 'REQUESTED',
    datasetDescription: 'GP records',
    requestedAt: new Date('2026-01-10'),
    deliveredAt: null,
    deliveryNotes: null,
    dataHolder: { name: 'GP Information Network (LINH)' },
    ...overrides,
  } as unknown as Requests[number];
}

describe('ExtractionRequestsPanel — registering a request', () => {
  it('shows the empty state, and a way to open the registration form for a manager', () => {
    render(
      <ExtractionRequestsPanel applicationId="app-1" currentUserId="u-1" requests={[]} dataHolders={DATA_HOLDERS} canManage={true} />,
    );
    expect(screen.getByText('noneRegistered')).toBeInTheDocument();
    expect(screen.getByText('+ registerRequest')).toBeInTheDocument();
  });

  it('hides the registration control for a non-manager', () => {
    render(
      <ExtractionRequestsPanel applicationId="app-1" currentUserId="u-1" requests={[]} dataHolders={DATA_HOLDERS} canManage={false} />,
    );
    expect(screen.queryByText('+ registerRequest')).not.toBeInTheDocument();
  });

  it('keeps submit disabled until a data holder and description are filled, then posts the payload and resets the form', async () => {
    render(
      <ExtractionRequestsPanel applicationId="app-1" currentUserId="u-1" requests={[]} dataHolders={DATA_HOLDERS} canManage={true} />,
    );

    fireEvent.click(screen.getByText('+ registerRequest'));

    // Once the form is open, the header's own "+ registerRequest" link is
    // gone, leaving the submit button as the only "registerRequest" match.
    const submitButton = screen.getByText('registerRequest');
    expect(submitButton).toBeDisabled();

    fireEvent.change(document.querySelector('select')!, { target: { value: 'dh-1' } });
    fireEvent.change(document.querySelector('textarea')!, { target: { value: 'GP records dataset' } });
    expect(submitButton).not.toBeDisabled();

    fireEvent.click(submitButton);

    await waitFor(() => expect(refresh).toHaveBeenCalled());

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/applications/app-1/extraction-requests',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init!.body as string)).toEqual({
      dataHolderId: 'dh-1',
      datasetDescription: 'GP records dataset',
      requestedById: 'u-1',
    });

    // Form closes and resets after a successful submit.
    expect(screen.queryByText('registerRequest')).not.toBeInTheDocument();
  });
});

describe('ExtractionRequestsPanel — existing requests and status transitions', () => {
  it('shows the status badge, dataset description and data holder name', () => {
    render(
      <ExtractionRequestsPanel
        applicationId="app-1"
        currentUserId="u-1"
        requests={[makeRequest()]}
        dataHolders={DATA_HOLDERS}
        canManage={true}
      />,
    );

    expect(screen.getByText('GP Information Network (LINH)')).toBeInTheDocument();
    expect(screen.getByText('GP records')).toBeInTheDocument();
    expect(screen.getByText('REQUESTED')).toBeInTheDocument();
  });

  it('offers CONFIRMED/DECLINED transitions for a REQUESTED request and PATCHes the chosen status', async () => {
    render(
      <ExtractionRequestsPanel
        applicationId="app-1"
        currentUserId="u-1"
        requests={[makeRequest({ status: 'REQUESTED' })]}
        dataHolders={DATA_HOLDERS}
        canManage={true}
      />,
    );

    expect(screen.getByText('→ CONFIRMED')).toBeInTheDocument();
    expect(screen.getByText('→ DECLINED')).toBeInTheDocument();

    fireEvent.click(screen.getByText('→ CONFIRMED'));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/extraction-requests/req-1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'CONFIRMED' }) }),
    );
  });

  it('shows no further transitions for a DELIVERED request, and displays delivery notes', () => {
    render(
      <ExtractionRequestsPanel
        applicationId="app-1"
        currentUserId="u-1"
        requests={[makeRequest({ status: 'DELIVERED', deliveredAt: new Date('2026-01-15'), deliveryNotes: 'Delivered via SFTP' })]}
        dataHolders={DATA_HOLDERS}
        canManage={true}
      />,
    );

    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
    expect(screen.getByText('Delivered via SFTP')).toBeInTheDocument();
  });
});
