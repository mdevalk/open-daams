// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { NotesList } from './NotesList';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(cleanup);

type Notes = ComponentProps<typeof NotesList>['notes'];
type CurrentUser = ComponentProps<typeof NotesList>['currentUser'];

const CASE_HANDLER = { id: 'u-1', role: 'CASE_HANDLER', name: 'S. Bakker' } as unknown as CurrentUser;
const APPLICANT = { id: 'u-2', role: 'APPLICANT', name: 'A. de Vries' } as unknown as CurrentUser;

beforeEach(() => {
  refresh.mockReset();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});

describe('NotesList — internal-note toggle visibility', () => {
  it('shows the internal checkbox for staff roles', () => {
    render(<NotesList applicationId="app-1" notes={[]} currentUser={CASE_HANDLER} />);
    expect(screen.getByText('internal')).toBeInTheDocument();
  });

  it('hides the internal checkbox for an applicant', () => {
    render(<NotesList applicationId="app-1" notes={[]} currentUser={APPLICANT} />);
    expect(screen.queryByText('internal')).not.toBeInTheDocument();
  });
});

describe('NotesList — adding a note', () => {
  it('keeps the add button disabled until content is entered, then submits the right payload and refreshes', async () => {
    render(<NotesList applicationId="app-1" notes={[]} currentUser={CASE_HANDLER} />);

    const addButton = screen.getByText('addNote');
    expect(addButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('placeholder'), { target: { value: 'A new note' } });
    expect(addButton).not.toBeDisabled();

    const internalCheckbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(internalCheckbox);

    fireEvent.click(addButton);

    await waitFor(() => expect(refresh).toHaveBeenCalled());

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/applications/app-1/notes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ authorId: 'u-1', content: 'A new note', isInternal: true }),
      }),
    );
  });
});

describe('NotesList — rendered notes', () => {
  it('shows the empty state when there are no notes', () => {
    render(<NotesList applicationId="app-1" notes={[]} currentUser={CASE_HANDLER} />);
    expect(screen.getByText('noNotes')).toBeInTheDocument();
  });

  it('marks internal notes distinctly and shows the author name', () => {
    const notes = [
      {
        id: 'n-1',
        content: 'Public note',
        isInternal: false,
        createdAt: new Date('2026-01-01'),
        author: { id: 'u-1', name: 'S. Bakker', role: 'CASE_HANDLER' },
      },
      {
        id: 'n-2',
        content: 'Internal note',
        isInternal: true,
        createdAt: new Date('2026-01-02'),
        author: { id: 'u-1', name: 'S. Bakker', role: 'CASE_HANDLER' },
      },
    ] as unknown as Notes;

    render(<NotesList applicationId="app-1" notes={notes} currentUser={CASE_HANDLER} />);

    expect(screen.getByText('Public note')).toBeInTheDocument();
    expect(screen.getByText('Internal note')).toBeInTheDocument();
    expect(screen.getByText('internalTag')).toBeInTheDocument();

    const internalCard = screen.getByText('Internal note').closest('div')!;
    expect(internalCard.className).toContain('bg-amber-50');
  });
});
