// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SpeTypeList, SpeType } from './SpeTypeList';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(cleanup);

const TYPES: SpeType[] = [
  { id: 'type-1', name: 'Standard SPE', setupFee: 500, monthlyFee: 150 },
];

beforeEach(() => {
  refresh.mockReset();
});

describe('SpeTypeList — empty / read-only', () => {
  it('shows the empty message when there are no types and no add form open', () => {
    render(<SpeTypeList speOperatorId="op-1" types={[]} isAdmin={false} currentUserId="u-1" editable={false} />);
    expect(screen.getByText('typesEmpty')).toBeInTheDocument();
  });

  it('renders type name and fees in a table with no edit/delete buttons when not editable', () => {
    render(<SpeTypeList speOperatorId="op-1" types={TYPES} isAdmin={true} currentUserId="u-1" editable={false} />);
    expect(screen.getByText('Standard SPE')).toBeInTheDocument();
    expect(screen.getByText('€500')).toBeInTheDocument();
    expect(screen.getByText('€150')).toBeInTheDocument();
    expect(screen.queryByText('edit')).not.toBeInTheDocument();
    expect(screen.queryByText('+ addType')).not.toBeInTheDocument();
  });

  it('hides edit/delete/add controls for a non-admin even when editable', () => {
    render(<SpeTypeList speOperatorId="op-1" types={TYPES} isAdmin={false} currentUserId="u-1" editable={true} />);
    expect(screen.queryByText('edit')).not.toBeInTheDocument();
    expect(screen.queryByText('+ addType')).not.toBeInTheDocument();
  });
});

describe('SpeTypeList — editing an existing type', () => {
  it('edits a type and saves via PATCH', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    render(<SpeTypeList speOperatorId="op-1" types={TYPES} isAdmin={true} currentUserId="u-1" editable={true} />);

    fireEvent.click(screen.getByText('edit'));
    const nameInput = screen.getByDisplayValue('Standard SPE');
    fireEvent.change(nameInput, { target: { value: 'Premium SPE' } });
    fireEvent.click(screen.getByText('save'));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith('/api/spe-types/type-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Premium SPE', setupFee: '500', monthlyFee: '150', actingUserId: 'u-1' }),
    });
  });

  it('deletes a type via DELETE and refreshes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    render(<SpeTypeList speOperatorId="op-1" types={TYPES} isAdmin={true} currentUserId="u-1" editable={true} />);
    fireEvent.click(screen.getByText('delete'));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith('/api/spe-types/type-1', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actingUserId: 'u-1' }),
    });
  });
});

describe('SpeTypeList — adding a new type', () => {
  it('opens the add row, submits via POST, and closes the row on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    render(<SpeTypeList speOperatorId="op-1" types={[]} isAdmin={true} currentUserId="u-1" editable={true} />);

    fireEvent.click(screen.getByText('+ addType'));
    const row = screen.getByText('addTypeSubmit').closest('tr') as HTMLElement;
    fireEvent.change(within(row).getByPlaceholderText('typeName'), { target: { value: 'Basic SPE' } });
    fireEvent.change(within(row).getByPlaceholderText('setupFee'), { target: { value: '250' } });
    fireEvent.change(within(row).getByPlaceholderText('monthlyFee'), { target: { value: '75' } });
    fireEvent.click(within(row).getByText('addTypeSubmit'));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith('/api/spe-operators/op-1/types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Basic SPE', setupFee: '250', monthlyFee: '75', actingUserId: 'u-1' }),
    });
  });

  it('disables the submit button until a name is entered', () => {
    render(<SpeTypeList speOperatorId="op-1" types={[]} isAdmin={true} currentUserId="u-1" editable={true} />);
    fireEvent.click(screen.getByText('+ addType'));
    expect(screen.getByText('addTypeSubmit')).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('typeName'), { target: { value: 'Basic SPE' } });
    expect(screen.getByText('addTypeSubmit')).not.toBeDisabled();
  });
});
