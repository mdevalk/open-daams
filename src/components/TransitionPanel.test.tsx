// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { TransitionPanel } from './TransitionPanel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(cleanup);

type Application = ComponentProps<typeof TransitionPanel>['application'];
type CurrentUser = ComponentProps<typeof TransitionPanel>['currentUser'];

const CASE_HANDLER = { id: 'u-1', role: 'CASE_HANDLER', name: 'S. Bakker' } as unknown as CurrentUser;
const DECISION_MAKER = { id: 'u-2', role: 'DECISION_MAKER', name: 'J. de Boer' } as unknown as CurrentUser;

function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1',
    status: 'SUBMITTED',
    type: 'DATA_ACCESS_APPLICATION',
    additionalInfoRequestedFromStatus: null,
    feeEstimate: null,
    ...overrides,
  } as unknown as Application;
}

beforeEach(() => {
  refresh.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

describe('TransitionPanel — visibility', () => {
  it('renders nothing when there are no available transitions and no children', () => {
    const { container } = render(
      <TransitionPanel application={makeApplication({ status: 'DECISION_ISSUED' })} currentUser={CASE_HANDLER} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('still renders when there are no transitions but children are provided', () => {
    render(
      <TransitionPanel application={makeApplication({ status: 'DECISION_ISSUED' })} currentUser={CASE_HANDLER}>
        <p>extra content</p>
      </TransitionPanel>,
    );
    expect(screen.getByText('extra content')).toBeInTheDocument();
  });

  it('lists the available transitions for the current status/role', () => {
    render(<TransitionPanel application={makeApplication({ status: 'SUBMITTED' })} currentUser={CASE_HANDLER} />);
    expect(screen.getByText('startPreScreening.label')).toBeInTheDocument();
    expect(screen.getByText('withdraw.label')).toBeInTheDocument();
  });

  it('excludes the positive-decision transition when the fee estimate is not accepted', () => {
    render(
      <TransitionPanel
        application={makeApplication({ status: 'PROCESSING', feeEstimate: { status: 'PENDING' } })}
        currentUser={DECISION_MAKER}
      />,
    );
    expect(screen.queryByText('positiveDecision.label')).not.toBeInTheDocument();
    expect(screen.getByText('negativeDecision.label')).toBeInTheDocument();
  });

  it('includes the positive-decision transition once the fee estimate is accepted', () => {
    render(
      <TransitionPanel
        application={makeApplication({ status: 'PROCESSING', feeEstimate: { status: 'ACCEPTED' } })}
        currentUser={DECISION_MAKER}
      />,
    );
    expect(screen.getByText('positiveDecision.label')).toBeInTheDocument();
  });
});

describe('TransitionPanel — selecting a transition', () => {
  it('selecting a transition reveals the comment box and confirm button; selecting again hides it', () => {
    render(<TransitionPanel application={makeApplication({ status: 'SUBMITTED' })} currentUser={CASE_HANDLER} />);
    expect(screen.queryByPlaceholderText('commentPlaceholder')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('startPreScreening.label'));
    expect(screen.getByPlaceholderText('commentPlaceholder')).toBeInTheDocument();

    fireEvent.click(screen.getByText('startPreScreening.label'));
    expect(screen.queryByPlaceholderText('commentPlaceholder')).not.toBeInTheDocument();
  });

  it('shows the "comment required" marker for a negative-decision transition', () => {
    render(
      <TransitionPanel
        application={makeApplication({ status: 'PROCESSING' })}
        currentUser={DECISION_MAKER}
      />,
    );
    fireEvent.click(screen.getByText('negativeDecision.label'));
    expect(screen.getByText('commentRequiredNegative')).toBeInTheDocument();
  });

  it('submits the transition with comment and decision outcome, then refreshes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    render(
      <TransitionPanel
        application={makeApplication({ status: 'PROCESSING', feeEstimate: { status: 'ACCEPTED' } })}
        currentUser={DECISION_MAKER}
      />,
    );
    fireEvent.click(screen.getByText('positiveDecision.label'));
    fireEvent.change(screen.getByPlaceholderText('commentPlaceholder'), { target: { value: 'Looks good' } });
    fireEvent.click(screen.getByText(/confirmButton/));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith('/api/applications/app-1/transition', expect.objectContaining({ method: 'POST' }));
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({
      toStatus: 'DECISION_ISSUED',
      actingUserId: 'u-2',
      comment: 'Looks good',
      decisionOutcome: 'POSITIVE',
    });
  });

  it('shows an error message when the transition request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Blocked' }) }));
    render(<TransitionPanel application={makeApplication({ status: 'SUBMITTED' })} currentUser={CASE_HANDLER} />);
    fireEvent.click(screen.getByText('startPreScreening.label'));
    fireEvent.click(screen.getByText(/confirmButton/));
    expect(await screen.findByText('Blocked')).toBeInTheDocument();
  });
});
