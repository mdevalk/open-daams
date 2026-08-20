// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { DecisionCardPanel } from './DecisionCardPanel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(cleanup);

type Application = ComponentProps<typeof DecisionCardPanel>['application'];
type CurrentUser = ComponentProps<typeof DecisionCardPanel>['currentUser'];

function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1',
    decisionOutcome: 'POSITIVE',
    decisionId: 'DEC-2026-001',
    permitAcceptanceStatus: 'PENDING',
    permitConditionsSentAt: '2026-01-01T00:00:00.000Z',
    permitAcceptanceDeadline: new Date(Date.now() + 20 * 86_400_000).toISOString(),
    permitAcceptedAt: null,
    negativeDecisionSentAt: null,
    ...overrides,
  } as unknown as Application;
}

const APPLICANT_USER = { id: 'u-1', role: 'APPLICANT' } as unknown as CurrentUser;
const CASE_HANDLER = { id: 'u-2', role: 'CASE_HANDLER' } as unknown as CurrentUser;

beforeEach(() => {
  refresh.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

describe('DecisionCardPanel — no decision yet', () => {
  it('renders nothing when there is no decisionOutcome/decisionId', () => {
    const { container } = render(
      <DecisionCardPanel application={makeApplication({ decisionOutcome: null, decisionId: null })} currentUser={APPLICANT_USER} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('DecisionCardPanel — negative decision', () => {
  it('renders the negative-decision card with the decision id and PDF link', () => {
    render(
      <DecisionCardPanel
        application={makeApplication({ decisionOutcome: 'NEGATIVE', negativeDecisionSentAt: new Date('2026-01-02T00:00:00.000Z') })}
        currentUser={APPLICANT_USER}
      />,
    );
    expect(screen.getByText('negativeTitle')).toBeInTheDocument();
    expect(screen.getByText('DEC-2026-001')).toBeInTheDocument();
    const link = screen.getByText('viewPdf');
    expect(link).toHaveAttribute('href', '/api/applications/app-1/decision-card/pdf?userId=u-1');
  });
});

describe('DecisionCardPanel — positive decision, pending acceptance', () => {
  it('shows accept/decline buttons for an APPLICANT', () => {
    render(<DecisionCardPanel application={makeApplication()} currentUser={APPLICANT_USER} />);
    expect(screen.getByText('status.PENDING')).toBeInTheDocument();
    expect(screen.getByText('accept')).toBeInTheDocument();
    expect(screen.getByText('decline')).toBeInTheDocument();
    expect(screen.queryByText('recordAcceptance')).not.toBeInTheDocument();
  });

  it('shows recordAcceptance/recordDecline buttons for a CASE_HANDLER acting on behalf', () => {
    render(<DecisionCardPanel application={makeApplication()} currentUser={CASE_HANDLER} />);
    expect(screen.getByText('recordAcceptance')).toBeInTheDocument();
    expect(screen.getByText('recordDecline')).toBeInTheDocument();
    expect(screen.queryByText('accept')).not.toBeInTheDocument();
  });

  it('shows the overdue notice and markNoResponse label when the deadline has passed', () => {
    render(
      <DecisionCardPanel
        application={makeApplication({ permitAcceptanceDeadline: new Date(Date.now() - 86_400_000) })}
        currentUser={CASE_HANDLER}
      />,
    );
    expect(screen.getByText('deadlineOverdueNotice')).toBeInTheDocument();
    expect(screen.getByText('markNoResponse')).toBeInTheDocument();
    expect(screen.getByText('status.PENDING')).toHaveClass('bg-red-100');
  });

  it('calls the decision-card API with ACCEPTED when accept is clicked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    render(<DecisionCardPanel application={makeApplication()} currentUser={APPLICANT_USER} />);

    fireEvent.click(screen.getByText('accept'));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith('/api/applications/app-1/decision-card', expect.objectContaining({ method: 'PATCH' }));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ status: 'ACCEPTED', actingUserId: 'u-1' });
  });

  it('shows an error message when the API call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Forbidden' }) }));
    render(<DecisionCardPanel application={makeApplication()} currentUser={APPLICANT_USER} />);

    fireEvent.click(screen.getByText('decline'));

    await waitFor(() => expect(screen.getByText('Forbidden')).toBeInTheDocument());
  });
});

describe('DecisionCardPanel — positive decision, already accepted', () => {
  it('shows the acceptedAt message and no action buttons', () => {
    render(
      <DecisionCardPanel
        application={makeApplication({ permitAcceptanceStatus: 'ACCEPTED', permitAcceptedAt: new Date('2026-01-05T00:00:00.000Z') })}
        currentUser={APPLICANT_USER}
      />,
    );
    expect(screen.getByText('status.ACCEPTED')).toBeInTheDocument();
    expect(screen.queryByText('accept')).not.toBeInTheDocument();
    expect(screen.queryByText('decline')).not.toBeInTheDocument();
  });
});
