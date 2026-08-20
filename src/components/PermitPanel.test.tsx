// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { PermitPanel } from './PermitPanel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(cleanup);

type Application = ComponentProps<typeof PermitPanel>['application'];
type CurrentUser = ComponentProps<typeof PermitPanel>['currentUser'];

const DECISION_MAKER = { id: 'u-1', role: 'DECISION_MAKER' } as unknown as CurrentUser;
const CASE_HANDLER = { id: 'u-2', role: 'CASE_HANDLER' } as unknown as CurrentUser;

const DATA_HOLDERS = [{ id: 'dh-1', name: 'GP Information Network' }];
const DATA_USERS = [{ id: 'du-1', name: 'UMC Utrecht' }];

function makeApplication(overrides: Record<string, unknown> = {}): Application {
  return {
    id: 'app-1',
    status: 'DECISION_ISSUED',
    decisionOutcome: 'POSITIVE',
    permitAcceptanceStatus: 'ACCEPTED',
    dataPermit: null,
    feeEstimate: null,
    ...overrides,
  } as unknown as Application;
}

beforeEach(() => {
  refresh.mockReset();
});

describe('PermitPanel — visibility gating', () => {
  it('renders nothing when the application has no positive decision yet', () => {
    const { container } = render(
      <PermitPanel
        application={makeApplication({ status: 'PROCESSING', decisionOutcome: null })}
        currentUser={DECISION_MAKER}
        dataHolders={DATA_HOLDERS}
        dataUsers={DATA_USERS}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the applicant has not yet accepted a positive decision', () => {
    const { container } = render(
      <PermitPanel
        application={makeApplication({ permitAcceptanceStatus: 'PENDING' })}
        currentUser={DECISION_MAKER}
        dataHolders={DATA_HOLDERS}
        dataUsers={DATA_USERS}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PermitPanel — issue form', () => {
  it('shows "no permission" instead of the form for a role that cannot issue', () => {
    render(
      <PermitPanel
        application={makeApplication()}
        currentUser={CASE_HANDLER}
        dataHolders={DATA_HOLDERS}
        dataUsers={DATA_USERS}
      />,
    );
    expect(screen.getByText('noPermission')).toBeInTheDocument();
    expect(screen.queryByText('issueButton')).not.toBeInTheDocument();
  });

  it('lists fee-estimate line items when an accepted estimate exists', () => {
    const application = makeApplication({
      feeEstimate: {
        speOperator: { name: 'SURF Research Cloud' },
        speType: { name: 'Standard SPE' },
        lineItems: [
          { id: 'li-1', category: 'SPE_SETUP', amount: 500, description: null },
          { id: 'li-2', category: 'ADMINISTRATIVE', amount: 100, description: 'One-off handling fee' },
        ],
      },
    });
    render(
      <PermitPanel application={application} currentUser={DECISION_MAKER} dataHolders={DATA_HOLDERS} dataUsers={DATA_USERS} />,
    );
    expect(screen.getByText('€500')).toBeInTheDocument();
    expect(screen.getByText('€100')).toBeInTheDocument();
    expect(screen.getByText('One-off handling fee')).toBeInTheDocument();
    expect(screen.getByText(/SURF Research Cloud/)).toBeInTheDocument();
  });

  it('disables the issue button until output controller name and affiliation are filled', () => {
    render(
      <PermitPanel application={makeApplication()} currentUser={DECISION_MAKER} dataHolders={DATA_HOLDERS} dataUsers={DATA_USERS} />,
    );
    const issueButton = screen.getByText('issueButton');
    expect(issueButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('outputControllerName'), { target: { value: 'J. Jansen' } });
    expect(issueButton).toBeDisabled();

    const affiliationSelect = screen.getByDisplayValue('outputControllerAffiliation...');
    fireEvent.change(affiliationSelect, { target: { value: 'UMC Utrecht' } });
    expect(issueButton).not.toBeDisabled();
  });

  it('issues the permit with the entered fields and refreshes on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    render(
      <PermitPanel application={makeApplication()} currentUser={DECISION_MAKER} dataHolders={DATA_HOLDERS} dataUsers={DATA_USERS} />,
    );

    fireEvent.change(screen.getByPlaceholderText('outputControllerName'), { target: { value: 'J. Jansen' } });
    fireEvent.change(screen.getByDisplayValue('outputControllerAffiliation...'), {
      target: { value: 'GP Information Network' },
    });
    fireEvent.click(screen.getByText('issueButton'));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/permits');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      applicationId: 'app-1',
      outputControllerName: 'J. Jansen',
      outputControllerAffiliation: 'GP Information Network',
      issuedByUserId: 'u-1',
    });
  });
});

describe('PermitPanel — existing permit', () => {
  it('renders a PermitCard linking to the permit detail page instead of the issue form', () => {
    const application = makeApplication({
      dataPermit: {
        id: 'permit-1',
        permitNumber: 'DP-NL-2025-0001',
        version: 1,
        status: 'GRANTED',
        issuedAt: new Date('2026-01-01'),
        validFrom: new Date('2026-01-01'),
        validUntil: new Date('2028-01-01'),
        previousPermit: null,
        revocationReason: null,
      },
    });
    render(
      <PermitPanel application={application} currentUser={DECISION_MAKER} dataHolders={DATA_HOLDERS} dataUsers={DATA_USERS} />,
    );
    expect(screen.queryByText('issueButton')).not.toBeInTheDocument();
    // version 1 renders as the bare permit number (formatPermitId only appends
    // "-vN" for version > 1).
    const link = screen.getByText('DP-NL-2025-0001').closest('a');
    expect(link).toHaveAttribute('href', '/permits/permit-1');
  });
});
