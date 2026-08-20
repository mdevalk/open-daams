// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { MasterdataAuditLog } from './MasterdataAuditLog';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

afterEach(cleanup);

type Entries = ComponentProps<typeof MasterdataAuditLog>['entries'];

function makeEntry(overrides: Partial<Entries[number]> = {}): Entries[number] {
  return {
    id: 'audit-1',
    userId: 'u-1',
    entityType: 'DataHolder',
    entityId: 'dh-1',
    action: 'Updated data holder',
    comment: null,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    user: { name: 'S. Bakker' },
    ...overrides,
  } as unknown as Entries[number];
}

describe('MasterdataAuditLog', () => {
  it('renders the empty state when there are no entries', async () => {
    const element = await MasterdataAuditLog({ entries: [], locale: 'nl' });
    render(element);
    expect(screen.getByText('noRecentChanges')).toBeInTheDocument();
  });

  it('renders an entry action, actor name, and no comment when comment is null', async () => {
    const element = await MasterdataAuditLog({ entries: [makeEntry()], locale: 'nl' });
    render(element);

    expect(screen.getByText('Updated data holder')).toBeInTheDocument();
    expect(screen.getByText(/S\. Bakker/)).toBeInTheDocument();
  });

  it('renders the comment when present', async () => {
    const element = await MasterdataAuditLog({
      entries: [makeEntry({ comment: 'Corrected VAT number after applicant request' })],
      locale: 'nl',
    });
    render(element);

    expect(screen.getByText('Corrected VAT number after applicant request')).toBeInTheDocument();
  });
});
