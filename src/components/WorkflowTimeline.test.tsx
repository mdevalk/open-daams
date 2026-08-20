// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { WorkflowTimeline } from './WorkflowTimeline';
import { formatDateTime } from '@/lib/utils';

// WorkflowTimeline has no 'use client' directive and imports only
// next-intl's useTranslations (no next/navigation hooks) — so this is the
// only mock it needs.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

afterEach(cleanup);

type Logs = ComponentProps<typeof WorkflowTimeline>['logs'];

describe('WorkflowTimeline', () => {
  it('shows the empty state when there are no logs', () => {
    render(<WorkflowTimeline logs={[]} />);
    expect(screen.getByText('noHistory')).toBeInTheDocument();
  });

  it('renders an entry with its action, status transition, comment and author', () => {
    const createdAt = new Date('2026-01-15T10:30:00Z');
    const logs = [
      {
        id: 'log-1',
        action: 'Application submitted',
        fromStatus: 'SUBMITTED',
        toStatus: 'PROCESSING',
        comment: 'Initial review',
        createdAt,
        user: { id: 'u-1', name: 'S. Bakker', role: 'CASE_HANDLER' },
      },
    ] as unknown as Logs;

    render(<WorkflowTimeline logs={logs} />);

    const item = screen.getByText('Application submitted').closest('li')!;
    expect(item).toHaveTextContent('SUBMITTED → PROCESSING');
    expect(item).toHaveTextContent('Initial review');
    expect(item).toHaveTextContent('S. Bakker');
    expect(item).toHaveTextContent(formatDateTime(createdAt));
  });

  it('omits the status-transition line when fromStatus is null', () => {
    const logs = [
      {
        id: 'log-2',
        action: 'Note added',
        fromStatus: null,
        toStatus: null,
        comment: null,
        createdAt: new Date('2026-01-15T10:30:00Z'),
        user: { id: 'u-1', name: 'S. Bakker', role: 'CASE_HANDLER' },
      },
    ] as unknown as Logs;

    render(<WorkflowTimeline logs={logs} />);

    expect(screen.getByText('Note added')).toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });
});
