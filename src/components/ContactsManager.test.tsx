// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ContactsManager } from './ContactsManager';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(cleanup);

const OWNERS = {
  DataUser: [{ id: 'du-1', name: 'UMC Utrecht' }],
  DataHolder: [{ id: 'dh-1', name: 'GP Information Network' }],
  SpeOperator: [{ id: 'so-1', name: 'RIVM SPE Operations' }],
  SpeProvider: [{ id: 'sp-1', name: 'Acme Cloud' }],
};

const CONTACT = {
  id: 'c-1',
  name: 'Jane Doe',
  email: 'jane@example.nl',
  phone: '0612345678',
  role: 'PRIMARY' as const,
  ownerType: 'DataHolder' as const,
  ownerName: 'GP Information Network',
};

beforeEach(() => {
  refresh.mockReset();
});

describe('ContactsManager — listing', () => {
  it('shows the empty message when there are no contacts and the add form is closed', () => {
    render(<ContactsManager contacts={[]} owners={OWNERS} isAdmin={true} currentUserId="u-1" />);
    expect(screen.getByText('empty')).toBeInTheDocument();
  });

  it('renders name, email/phone as mailto/tel links, and the owner name', () => {
    render(<ContactsManager contacts={[CONTACT]} owners={OWNERS} isAdmin={false} currentUserId="u-1" />);

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('jane@example.nl').closest('a')).toHaveAttribute('href', 'mailto:jane@example.nl');
    expect(screen.getByText('0612345678').closest('a')).toHaveAttribute('href', 'tel:0612345678');
    expect(screen.getByText('GP Information Network')).toBeInTheDocument();
  });

  it('falls back to "unnamed" for a contact with no name, and hides edit/delete for a non-admin', () => {
    render(
      <ContactsManager contacts={[{ ...CONTACT, name: null }]} owners={OWNERS} isAdmin={false} currentUserId="u-1" />,
    );
    expect(screen.getByText('unnamed')).toBeInTheDocument();
    expect(screen.queryByText('edit')).not.toBeInTheDocument();
    expect(screen.queryByText('delete')).not.toBeInTheDocument();
  });
});

describe('ContactsManager — add new', () => {
  it('disables submit until a name/email and an owner are chosen, then creates and refreshes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    render(<ContactsManager contacts={[]} owners={OWNERS} isAdmin={true} currentUserId="u-1" />);
    fireEvent.click(screen.getByText('+ addNew'));

    const submit = screen.getByText('addNew');
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('name'), { target: { value: 'New Person' } });
    expect(submit).toBeDisabled(); // still missing owner type/id

    fireEvent.change(screen.getByDisplayValue('ownerType...'), { target: { value: 'DataHolder' } });
    fireEvent.change(screen.getByDisplayValue('owner...'), { target: { value: 'dh-1' } });
    expect(submit).not.toBeDisabled();

    fireEvent.click(submit);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/contacts');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ ownerType: 'DataHolder', ownerId: 'dh-1', name: 'New Person', actingUserId: 'u-1' });
  });
});

describe('ContactsManager — edit / delete', () => {
  it('edits a contact with the owner picker pre-filled to its current owner, and saves the updated fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    render(<ContactsManager contacts={[CONTACT]} owners={OWNERS} isAdmin={true} currentUserId="u-1" />);
    fireEvent.click(screen.getByText('edit'));

    expect(screen.getByDisplayValue('GP Information Network')).toBeInTheDocument();

    const nameInput = screen.getByDisplayValue('Jane Doe');
    fireEvent.change(nameInput, { target: { value: 'Jane Updated' } });
    fireEvent.click(screen.getByText('save'));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/contacts/c-1');
    expect((init as RequestInit).method).toBe('PATCH');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ name: 'Jane Updated', ownerType: 'DataHolder', ownerId: 'dh-1', actingUserId: 'u-1' });
  });

  it('reassigns a contact to a different owner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    render(<ContactsManager contacts={[CONTACT]} owners={OWNERS} isAdmin={true} currentUserId="u-1" />);
    fireEvent.click(screen.getByText('edit'));

    fireEvent.change(screen.getByDisplayValue('ownerTypeDataHolder'), { target: { value: 'SpeOperator' } });
    fireEvent.change(screen.getByDisplayValue('owner...'), { target: { value: 'so-1' } });
    fireEvent.click(screen.getByText('save'));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    const fetchMock = vi.mocked(fetch);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ ownerType: 'SpeOperator', ownerId: 'so-1' });
  });

  it('deletes a contact', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    render(<ContactsManager contacts={[CONTACT]} owners={OWNERS} isAdmin={true} currentUserId="u-1" />);
    fireEvent.click(screen.getByText('delete'));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/contacts/c-1');
    expect((init as RequestInit).method).toBe('DELETE');
  });
});
