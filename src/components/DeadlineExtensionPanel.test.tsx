// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { DeadlineExtensionPanel } from './DeadlineExtensionPanel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(cleanup);

type Application = ComponentProps<typeof DeadlineExtensionPanel>['application'];
type CurrentUser = ComponentProps<typeof DeadlineExtensionPanel>['currentUser'];

const CASE_HANDLER = { id: 'u-1', role: 'CASE_HANDLER' } as unknown as CurrentUser;
const APPLICANT = { id: 'u-2', role: 'APPLICANT' } as unknown as CurrentUser;

function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1',
    status: 'PROCESSING',
    deadlineExtended: false,
    deadlineExtensionReason: null,
    ...overrides,
  } as unknown as Application;
}

beforeEach(() => {
  refresh.mockReset();
});

describe('DeadlineExtensionPanel — visibility', () => {
  it('renders nothing once the application has a final status', () => {
    const { container } = render(
      <DeadlineExtensionPanel application={makeApplication({ status: 'DECISION_ISSUED' })} currentUser={CASE_HANDLER} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a non-manager user when no extension has been granted', () => {
    const { container } = render(
      <DeadlineExtensionPanel application={makeApplication()} currentUser={APPLICANT} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the extended reason (read-only) to a non-manager user once an extension exists', () => {
    render(
      <DeadlineExtensionPanel
        application={makeApplication({ deadlineExtended: true, deadlineExtensionReason: 'Awaiting ethics review' })}
        currentUser={APPLICANT}
      />,
    );
    expect(screen.getByText('Awaiting ethics review')).toBeInTheDocument();
    expect(screen.queryByText('extendButton')).not.toBeInTheDocument();
  });
});

describe('DeadlineExtensionPanel — case handler flow', () => {
  it('opens the reason form and submits the extension', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    render(<DeadlineExtensionPanel application={makeApplication()} currentUser={CASE_HANDLER} />);

    fireEvent.click(screen.getByText('extendButton'));
    const textarea = screen.getByPlaceholderText('reasonPlaceholder');
    fireEvent.change(textarea, { target: { value: 'Need more time to review documents' } });
    fireEvent.click(screen.getByText('confirmButton'));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith('/api/applications/app-1/extend-deadline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Need more time to review documents', actingUserId: 'u-1' }),
    });
  });

  it('disables the confirm button until a reason is entered', () => {
    render(<DeadlineExtensionPanel application={makeApplication()} currentUser={CASE_HANDLER} />);
    fireEvent.click(screen.getByText('extendButton'));
    expect(screen.getByText('confirmButton')).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('reasonPlaceholder'), { target: { value: 'x' } });
    expect(screen.getByText('confirmButton')).not.toBeDisabled();
  });

  it('cancels editing and clears the form state without submitting', () => {
    render(<DeadlineExtensionPanel application={makeApplication()} currentUser={CASE_HANDLER} />);
    fireEvent.click(screen.getByText('extendButton'));
    fireEvent.change(screen.getByPlaceholderText('reasonPlaceholder'), { target: { value: 'x' } });
    fireEvent.click(screen.getByText('cancelButton'));
    expect(screen.queryByPlaceholderText('reasonPlaceholder')).not.toBeInTheDocument();
    expect(screen.getByText('extendButton')).toBeInTheDocument();
  });
});

describe('DeadlineExtensionPanel — embedded mode', () => {
  it('renders as a bare row (no wrapping card/heading) when embedded, vs a card with an h2 heading otherwise', () => {
    const { container: embeddedContainer } = render(
      <DeadlineExtensionPanel application={makeApplication()} currentUser={CASE_HANDLER} embedded />,
    );
    expect(embeddedContainer.querySelector('h2')).not.toBeInTheDocument();
    expect(screen.getByText('extendButton')).toBeInTheDocument();
    cleanup();

    const { container: cardContainer } = render(
      <DeadlineExtensionPanel application={makeApplication()} currentUser={CASE_HANDLER} />,
    );
    expect(cardContainer.querySelector('h2')).toHaveTextContent('title');
  });
});
