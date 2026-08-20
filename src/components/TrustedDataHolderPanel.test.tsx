// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TrustedDataHolderPanel } from './TrustedDataHolderPanel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(cleanup);

const DATA_HOLDERS = [
  { id: 'dh-1', name: 'GP Information Network (LINH)' },
  { id: 'dh-2', name: 'Statistics Netherlands (CBS)' },
];

beforeEach(() => {
  refresh.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

describe('TrustedDataHolderPanel — read-only rendering', () => {
  it('shows the trusted data holder name when set', () => {
    render(
      <TrustedDataHolderPanel
        application={{ id: 'app-1', trustedDataHolderId: 'dh-1', trustedDataHolder: { name: 'GP Information Network (LINH)' } }}
        dataHolders={DATA_HOLDERS}
        currentUser={{ id: 'u-1', role: 'APPLICANT' }}
      />,
    );
    expect(screen.getByText('GP Information Network (LINH)')).toBeInTheDocument();
  });

  it('shows noneSelected when not set', () => {
    render(
      <TrustedDataHolderPanel
        application={{ id: 'app-1', trustedDataHolderId: null, trustedDataHolder: null }}
        dataHolders={DATA_HOLDERS}
        currentUser={{ id: 'u-1', role: 'APPLICANT' }}
      />,
    );
    expect(screen.getByText('noneSelected')).toBeInTheDocument();
  });

  it('does not show the edit button for a role without manage permission', () => {
    render(
      <TrustedDataHolderPanel
        application={{ id: 'app-1', trustedDataHolderId: null, trustedDataHolder: null }}
        dataHolders={DATA_HOLDERS}
        currentUser={{ id: 'u-1', role: 'APPLICANT' }}
      />,
    );
    expect(screen.queryByText('edit')).not.toBeInTheDocument();
  });
});

describe('TrustedDataHolderPanel — editing (CASE_HANDLER)', () => {
  it('shows the edit button and opens a select populated with the data holders', () => {
    render(
      <TrustedDataHolderPanel
        application={{ id: 'app-1', trustedDataHolderId: null, trustedDataHolder: null }}
        dataHolders={DATA_HOLDERS}
        currentUser={{ id: 'u-1', role: 'CASE_HANDLER' }}
      />,
    );
    fireEvent.click(screen.getByText('edit'));
    const select = screen.getByText('save').closest('div')!.parentElement!.querySelector('select')!;
    expect(select.querySelectorAll('option')).toHaveLength(3); // noneSelected + 2 data holders
  });

  it('cancel restores the original selection and closes the form', () => {
    render(
      <TrustedDataHolderPanel
        application={{ id: 'app-1', trustedDataHolderId: 'dh-1', trustedDataHolder: { name: 'GP Information Network (LINH)' } }}
        dataHolders={DATA_HOLDERS}
        currentUser={{ id: 'u-1', role: 'CASE_HANDLER' }}
      />,
    );
    fireEvent.click(screen.getByText('edit'));
    const select = screen.getByDisplayValue('GP Information Network (LINH)') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'dh-2' } });
    fireEvent.click(screen.getByText('cancel'));
    expect(screen.queryByText('save')).not.toBeInTheDocument();
    expect(screen.getByText('GP Information Network (LINH)')).toBeInTheDocument();
  });

  it('save PATCHes the selected trustedDataHolderId and refreshes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    render(
      <TrustedDataHolderPanel
        application={{ id: 'app-1', trustedDataHolderId: null, trustedDataHolder: null }}
        dataHolders={DATA_HOLDERS}
        currentUser={{ id: 'u-1', role: 'CASE_HANDLER' }}
      />,
    );
    fireEvent.click(screen.getByText('edit'));
    fireEvent.change(screen.getByDisplayValue('noneSelected'), { target: { value: 'dh-2' } });
    fireEvent.click(screen.getByText('save'));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/applications/app-1/trusted-data-holder',
      expect.objectContaining({ method: 'PATCH' }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ trustedDataHolderId: 'dh-2', actingUserId: 'u-1' });
  });

  it('shows an error message when the API call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Not allowed' }) }));
    render(
      <TrustedDataHolderPanel
        application={{ id: 'app-1', trustedDataHolderId: null, trustedDataHolder: null }}
        dataHolders={DATA_HOLDERS}
        currentUser={{ id: 'u-1', role: 'CASE_HANDLER' }}
      />,
    );
    fireEvent.click(screen.getByText('edit'));
    fireEvent.click(screen.getByText('save'));

    await waitFor(() => expect(screen.getByText('Not allowed')).toBeInTheDocument());
  });
});
