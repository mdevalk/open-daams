// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { SecurityLogTable } from './SecurityLogTable';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

afterEach(cleanup);

type Entries = ComponentProps<typeof SecurityLogTable>['entries'];

function makeEntry(overrides: Partial<Entries[number]> = {}): Entries[number] {
  return {
    id: 'log-1',
    createdAt: '2026-01-05T10:30:00.000Z',
    reason: 'role_not_permitted',
    attemptedUserId: 'u-9',
    detail: 'Attempted to PATCH /api/permits/p-1',
    ...overrides,
  } as unknown as Entries[number];
}

describe('SecurityLogTable — empty state', () => {
  it('shows the empty message and no table when there are no entries', async () => {
    const element = await SecurityLogTable({ entries: [] as Entries, locale: 'nl' });
    render(element);
    expect(screen.getByText('empty')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('SecurityLogTable — rows', () => {
  it('renders a row per entry with the mapped reason key, attempted user id, and detail', async () => {
    const element = await SecurityLogTable({
      entries: [
        makeEntry(),
        makeEntry({ id: 'log-2', reason: 'missing_user_id', attemptedUserId: null, detail: 'No userId provided' }),
      ],
      locale: 'nl',
    });
    render(element);

    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2 entries
    expect(screen.getByText('reasonRoleNotPermitted')).toBeInTheDocument();
    expect(screen.getByText('reasonMissingUserId')).toBeInTheDocument();
    expect(screen.getByText('u-9')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument(); // attemptedUserId null fallback
    expect(screen.getByText('Attempted to PATCH /api/permits/p-1')).toBeInTheDocument();
  });

  it('falls back to reasonUnknown for a reason not in the mapping', async () => {
    const element = await SecurityLogTable({ entries: [makeEntry({ reason: 'something_else' })], locale: 'nl' });
    render(element);
    expect(screen.getByText('reasonUnknown')).toBeInTheDocument();
  });
});
