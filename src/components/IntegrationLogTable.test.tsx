// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { IntegrationLogTable } from './IntegrationLogTable';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

afterEach(cleanup);

type Entries = ComponentProps<typeof IntegrationLogTable>['entries'];

function makeEntry(overrides: Partial<Entries[number]> = {}): Entries[number] {
  return {
    id: 'log-1',
    direction: 'OUTBOUND',
    operation: 'applications.list',
    outcome: 'SUCCESS',
    errorMessage: null,
    applicationId: 'app-1',
    application: { id: 'app-1', referenceNumber: 'REF-001' },
    initiatedById: 'u-1',
    initiatedBy: { name: 'S. Bakker' },
    createdAt: new Date('2026-01-15T10:00:00Z'),
    ...overrides,
  } as unknown as Entries[number];
}

describe('IntegrationLogTable', () => {
  it('renders the empty state when there are no entries', async () => {
    const element = await IntegrationLogTable({ entries: [], locale: 'nl' });
    render(element);
    expect(screen.getByText('empty')).toBeInTheDocument();
  });

  it('renders a row with application link, initiator, and success styling', async () => {
    const element = await IntegrationLogTable({ entries: [makeEntry()], locale: 'nl' });
    render(element);

    expect(screen.getByText('applications.list')).toBeInTheDocument();
    expect(screen.getByText('outcomeSuccess')).toHaveClass('bg-emerald-100');
    expect(screen.getByText('directionOutbound')).toBeInTheDocument();
    expect(screen.getByText('S. Bakker')).toBeInTheDocument();

    const link = screen.getByText('REF-001');
    expect(link).toHaveAttribute('href', '/nl/applications/app-1');
  });

  it('renders placeholders and failure styling when application/initiator are missing and outcome failed', async () => {
    const element = await IntegrationLogTable({
      entries: [
        makeEntry({
          outcome: 'FAILURE',
          errorMessage: 'Timeout contacting NCP',
          application: null,
          initiatedBy: null,
        }),
      ],
      locale: 'nl',
    });
    render(element);

    expect(screen.getByText('outcomeFailure')).toHaveClass('bg-red-100');
    expect(screen.getByText('Timeout contacting NCP')).toBeInTheDocument();
    // Two '—' placeholders: one for the missing application, one for the missing initiator.
    expect(screen.getAllByText('—')).toHaveLength(2);
  });
});
