// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { AuditLogTable } from './AuditLogTable';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

afterEach(cleanup);

type Entries = ComponentProps<typeof AuditLogTable>['entries'];

function makeEntry(overrides: Partial<Entries[number]> = {}): Entries[number] {
  return {
    id: 'log-1',
    createdAt: '2026-01-01T10:00:00Z',
    entityType: 'Application',
    entityId: 'app-1',
    action: 'STATUS_CHANGE',
    comment: null,
    user: { name: 'S. Bakker' },
    ...overrides,
  } as unknown as Entries[number];
}

describe('AuditLogTable', () => {
  it('shows the empty-state message when there are no entries', async () => {
    const element = await AuditLogTable({ entries: [] as Entries, locale: 'nl' });
    render(element);
    expect(screen.getByText('empty')).toBeInTheDocument();
  });

  it('renders a table row per entry with user, entity, action, and a dash for no comment', async () => {
    const element = await AuditLogTable({ entries: [makeEntry()] as Entries, locale: 'nl' });
    render(element);
    expect(screen.getByText('S. Bakker')).toBeInTheDocument();
    expect(screen.getByText(/Application/)).toBeInTheDocument();
    expect(screen.getByText(/app-1/)).toBeInTheDocument();
    expect(screen.getByText('STATUS_CHANGE')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows the comment text when present', async () => {
    const element = await AuditLogTable({
      entries: [makeEntry({ comment: 'Manual override' })] as Entries,
      locale: 'nl',
    });
    render(element);
    expect(screen.getByText('Manual override')).toBeInTheDocument();
  });

  it('renders one row per entry for multiple entries', async () => {
    const element = await AuditLogTable({
      entries: [makeEntry({ id: 'log-1' }), makeEntry({ id: 'log-2', entityId: 'app-2' })] as Entries,
      locale: 'nl',
    });
    const { container } = render(element);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
  });
});
