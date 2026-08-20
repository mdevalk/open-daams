// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { ApplicationCard } from './ApplicationCard';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${JSON.stringify(values)})` : key,
}));

afterEach(cleanup);

type Application = ComponentProps<typeof ApplicationCard>['application'];

function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1',
    referenceNumber: 'HDAB-2026-0001',
    title: 'Study on cardiovascular outcomes',
    status: 'PROCESSING',
    type: 'DATA_ACCESS_APPLICATION',
    source: 'NATIONAL',
    hdeuSendingCountry: null,
    decisionDeadline: null,
    applicant: { name: 'A. de Vries', dataUser: { name: 'UMC Utrecht' } },
    caseHandler: null,
    ...overrides,
  } as unknown as Application;
}

describe('ApplicationCard — basic rendering', () => {
  it('renders reference number, title, and organisation, linking to the application detail page', () => {
    render(<ApplicationCard application={makeApplication()} locale="nl" />);
    expect(screen.getByText('HDAB-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Study on cardiovascular outcomes')).toBeInTheDocument();
    expect(screen.getByText('UMC Utrecht')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/nl/applications/app-1');
  });

  it('shows an em-dash for organisation when the applicant has no dataUser', () => {
    render(<ApplicationCard application={makeApplication({ applicant: { name: 'A. de Vries', dataUser: null } })} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows the case handler name only when assigned', () => {
    const { rerender } = render(<ApplicationCard application={makeApplication({ caseHandler: null })} />);
    expect(screen.queryByText('caseHandler')).not.toBeInTheDocument();

    rerender(<ApplicationCard application={makeApplication({ caseHandler: { name: 'S. Bakker' } })} />);
    expect(screen.getByText('caseHandler')).toBeInTheDocument();
    expect(screen.getByText('S. Bakker')).toBeInTheDocument();
  });
});

describe('ApplicationCard — HD@EU badge', () => {
  it('shows the HD@EU badge with sending country when source is HDEU', () => {
    render(<ApplicationCard application={makeApplication({ source: 'HDEU', hdeuSendingCountry: 'BE' })} />);
    expect(screen.getByText('HD@EU • BE')).toBeInTheDocument();
  });

  it('does not show the badge for a native application', () => {
    render(<ApplicationCard application={makeApplication({ source: 'NATIONAL' })} />);
    expect(screen.queryByText(/HD@EU/)).not.toBeInTheDocument();
  });
});

describe('ApplicationCard — decision deadline', () => {
  it('does not render a deadline line when decisionDeadline is null', () => {
    render(<ApplicationCard application={makeApplication({ decisionDeadline: null })} />);
    expect(screen.queryByText('decisionDeadline')).not.toBeInTheDocument();
  });

  it('shows a red overdue-style deadline message for a past deadline', () => {
    const { container } = render(
      <ApplicationCard
        application={makeApplication({ decisionDeadline: new Date(Date.now() - 3 * 86_400_000) })}
      />,
    );
    const deadlineText = container.querySelector('p.mt-3')!;
    expect(deadlineText.textContent).toContain('decisionDeadline');
    expect(deadlineText).toHaveClass('text-[#d52b1e]');
    expect(deadlineText.textContent).toContain('daysOverdue');
  });

  it('shows a neutral-style deadline message for a far-future deadline', () => {
    const { container } = render(
      <ApplicationCard
        application={makeApplication({ decisionDeadline: new Date(Date.now() + 60 * 86_400_000) })}
      />,
    );
    const deadlineText = container.querySelector('p.mt-3')!;
    expect(deadlineText.textContent).toContain('decisionDeadline');
    expect(deadlineText).toHaveClass('text-gray-400');
    expect(deadlineText.textContent).toContain('daysRemaining');
  });
});
