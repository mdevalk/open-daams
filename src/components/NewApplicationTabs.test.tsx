// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { NewApplicationTabs } from './NewApplicationTabs';

// NewApplicationTabs itself renders no translated text (labels come in as
// props), but its three children (NewApplicationForm, HdeuImportForm,
// NcpFetchForm) all call useTranslations, and two of them call useRouter.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(cleanup);

type Applicants = ComponentProps<typeof NewApplicationTabs>['applicants'];
type CurrentUser = ComponentProps<typeof NewApplicationTabs>['currentUser'];

const APPLICANT_USER = { id: 'u-2', role: 'APPLICANT', name: 'A. de Vries' } as unknown as CurrentUser;

beforeEach(() => {
  // NcpFetchForm fetches its queue on mount once its tab is selected.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ entries: [] }) }));
});

describe('NewApplicationTabs — switching tabs', () => {
  it('shows the manual form by default and swaps in the HD@EU / NCP forms on click', async () => {
    render(
      <NewApplicationTabs
        applicants={[] as Applicants}
        dataHolders={[]}
        currentUser={APPLICANT_USER}
        locale="nl"
        manualLabel="Manual"
        hdeuLabel="HD@EU"
        ncpLabel="NCP"
      />,
    );

    expect(screen.getByText('createButton')).toBeInTheDocument();
    expect(screen.queryByText('importButton')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('HD@EU'));
    expect(screen.queryByText('createButton')).not.toBeInTheDocument();
    expect(screen.getByText('importButton')).toBeInTheDocument();

    fireEvent.click(screen.getByText('NCP'));
    expect(screen.queryByText('importButton')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('refresh')).toBeInTheDocument());
  });

  it('marks the active tab button with aria-current="page"', () => {
    render(
      <NewApplicationTabs
        applicants={[] as Applicants}
        dataHolders={[]}
        currentUser={APPLICANT_USER}
        locale="nl"
        manualLabel="Manual"
        hdeuLabel="HD@EU"
        ncpLabel="NCP"
      />,
    );

    expect(screen.getByText('Manual')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('HD@EU')).not.toHaveAttribute('aria-current');

    fireEvent.click(screen.getByText('HD@EU'));
    expect(screen.getByText('HD@EU')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Manual')).not.toHaveAttribute('aria-current');
  });
});
