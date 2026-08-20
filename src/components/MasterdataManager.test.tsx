// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { MasterdataManager } from './MasterdataManager';
import { formatDate } from '@/lib/utils';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(cleanup);

type Entities = ComponentProps<typeof MasterdataManager>['entities'];
type Entity = Entities[number];

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'entity-1',
    name: 'GP Information Network',
    contacts: [],
    ...overrides,
  } as unknown as Entity;
}

async function jsonBody(call: unknown[]) {
  const [, init] = call;
  return JSON.parse((init as RequestInit).body as string);
}

beforeEach(() => {
  refresh.mockReset();
});

describe('MasterdataManager — empty / listing', () => {
  it('shows the empty message when there are no entities and the add form is closed', () => {
    render(
      <MasterdataManager
        apiBasePath="/api/data-holders"
        namespace="dataHolders"
        entities={[]}
        isAdmin={true}
        currentUserId="u-1"
      />,
    );
    expect(screen.getByText('empty')).toBeInTheDocument();
  });

  it('renders the entity name and contact name/email/phone as mailto/tel links', () => {
    const entity = makeEntity({
      contacts: [{ role: 'PRIMARY', name: 'J. de Boer', email: 'j.deboer@example.nl', phone: '0612345678' }],
    });
    render(
      <MasterdataManager apiBasePath="/api/data-holders" namespace="dataHolders" entities={[entity]} isAdmin={false} currentUserId="u-1" />,
    );
    expect(screen.getByText('GP Information Network')).toBeInTheDocument();
    expect(screen.getByText('J. de Boer')).toBeInTheDocument();
    expect(screen.getByText('j.deboer@example.nl')).toHaveAttribute('href', 'mailto:j.deboer@example.nl');
    expect(screen.getByText('0612345678')).toHaveAttribute('href', 'tel:0612345678');
  });

  it('shows the trusted badge only when hasTrustedFlag and the entity is trusted', () => {
    const { rerender } = render(
      <MasterdataManager
        apiBasePath="/api/spe-operators"
        namespace="speOperators"
        entities={[makeEntity({ isTrusted: true })]}
        hasTrustedFlag
        isAdmin={false}
        currentUserId="u-1"
      />,
    );
    expect(screen.getByText('trustedBadge')).toBeInTheDocument();

    rerender(
      <MasterdataManager
        apiBasePath="/api/spe-operators"
        namespace="speOperators"
        entities={[makeEntity({ isTrusted: false })]}
        hasTrustedFlag
        isAdmin={false}
        currentUserId="u-1"
      />,
    );
    expect(screen.queryByText('trustedBadge')).not.toBeInTheDocument();
  });

  it('shows the provider name (or a dash) when relationOptions are configured', () => {
    const relationOptions = [{ id: 'op-1', name: 'SURF Research Cloud' }];
    const { rerender } = render(
      <MasterdataManager
        apiBasePath="/api/spe-types"
        namespace="speTypes"
        entities={[makeEntity({ speProvider: { name: 'SURF Research Cloud' } })]}
        relationOptions={relationOptions}
        isAdmin={false}
        currentUserId="u-1"
      />,
    );
    expect(screen.getByText('providerLabel: SURF Research Cloud')).toBeInTheDocument();

    rerender(
      <MasterdataManager
        apiBasePath="/api/spe-types"
        namespace="speTypes"
        entities={[makeEntity({ speProvider: null })]}
        relationOptions={relationOptions}
        isAdmin={false}
        currentUserId="u-1"
      />,
    );
    expect(screen.getByText('providerLabel: —')).toBeInTheDocument();
  });

  it('shows only the billing display fields that have a value, formatting booleans and dates', () => {
    const entity = makeEntity({
      billingDetails: {
        sameAsContactPerson: true,
        fullName: 'A. Applicant',
        email: null,
        phone: null,
        organisationName: null,
        address: null,
        businessId: null,
        vatNumber: null,
        invoiceType: null,
        invoiceReferenceNumber: null,
        eInvoiceAddress: null,
        operatorId: null,
        peppolCode: null,
        isProjectFinanciallyCovered: false,
        financingAmountRange: null,
        section4ProfileDataDate: '2026-02-01',
      },
    });
    render(
      <MasterdataManager
        apiBasePath="/api/data-users"
        namespace="dataUsers"
        entities={[entity]}
        hasBillingDetailsDisplay
        isAdmin={false}
        currentUserId="u-1"
      />,
    );
    expect(screen.getByText('billingContactName')).toBeInTheDocument();
    expect(screen.getByText('A. Applicant')).toBeInTheDocument();
    // sameAsContactPerson true and isProjectFinanciallyCovered false are both
    // non-null booleans, so both render (hasFieldValue treats false as present).
    expect(screen.getAllByText('yes')).toHaveLength(1);
    expect(screen.getAllByText('no')).toHaveLength(1);
    expect(screen.getByText(formatDate('2026-02-01'))).toBeInTheDocument();
    // Fields left null (email, address, ...) must not render their label at all.
    expect(screen.queryByText('billingContactEmail')).not.toBeInTheDocument();
    expect(screen.queryByText('address')).not.toBeInTheDocument();
  });
});

describe('MasterdataManager — admin-only controls', () => {
  it('hides edit/delete and "+ addNew" for a non-admin', () => {
    render(
      <MasterdataManager apiBasePath="/api/data-holders" namespace="dataHolders" entities={[makeEntity()]} isAdmin={false} currentUserId="u-1" />,
    );
    expect(screen.queryByText('edit')).not.toBeInTheDocument();
    expect(screen.queryByText('delete')).not.toBeInTheDocument();
    expect(screen.queryByText('+ addNew')).not.toBeInTheDocument();
  });

  it('shows edit/delete and "+ addNew" for an admin', () => {
    render(
      <MasterdataManager apiBasePath="/api/data-holders" namespace="dataHolders" entities={[makeEntity()]} isAdmin={true} currentUserId="u-1" />,
    );
    expect(screen.getByText('edit')).toBeInTheDocument();
    expect(screen.getByText('delete')).toBeInTheDocument();
    expect(screen.getByText('+ addNew')).toBeInTheDocument();
  });
});

describe('MasterdataManager — Dutch phone validation', () => {
  it('shows the invalid hint and disables save for a malformed phone, and clears it for a valid one', () => {
    render(
      <MasterdataManager apiBasePath="/api/data-holders" namespace="dataHolders" entities={[makeEntity()]} isAdmin={true} currentUserId="u-1" />,
    );
    fireEvent.click(screen.getByText('edit'));

    fireEvent.change(screen.getByPlaceholderText('contactPhone'), { target: { value: '12345' } });
    expect(screen.getByText('contactPhoneInvalid')).toBeInTheDocument();
    expect(screen.getByText('save')).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('contactPhone'), { target: { value: '0612345678' } });
    expect(screen.getByText('contactPhoneHint')).toBeInTheDocument();
    expect(screen.getByText('save')).not.toBeDisabled();
  });
});

describe('MasterdataManager — edit flow', () => {
  it('prefills the edit form and cancels without submitting', () => {
    const entity = makeEntity({
      contacts: [{ role: 'PRIMARY', name: 'J. de Boer', email: 'j@example.nl', phone: '0612345678' }],
    });
    render(
      <MasterdataManager apiBasePath="/api/data-holders" namespace="dataHolders" entities={[entity]} isAdmin={true} currentUserId="u-1" />,
    );
    fireEvent.click(screen.getByText('edit'));
    expect(screen.getByDisplayValue('GP Information Network')).toBeInTheDocument();
    expect(screen.getByDisplayValue('j@example.nl')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0612345678')).toBeInTheDocument();

    fireEvent.click(screen.getByText('cancel'));
    expect(screen.queryByDisplayValue('GP Information Network')).not.toBeInTheDocument();
    expect(screen.getByText('GP Information Network')).toBeInTheDocument();
  });

  it('saves with the full payload (provider, trusted flag, billing fields) and refreshes on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    const relationOptions = [{ id: 'op-1', name: 'SURF Research Cloud' }];
    const entity = makeEntity({ speProviderId: '', isTrusted: false });

    const { container } = render(
      <MasterdataManager
        apiBasePath="/api/spe-operators"
        namespace="speOperators"
        entities={[entity]}
        relationOptions={relationOptions}
        hasTrustedFlag
        hasBillingDetails
        isAdmin={true}
        currentUserId="u-1"
      />,
    );
    fireEvent.click(screen.getByText('edit'));

    fireEvent.change(screen.getByPlaceholderText('contactEmail'), { target: { value: 'contact@surf.nl' } });
    fireEvent.change(screen.getByDisplayValue('providerLabel...'), { target: { value: 'op-1' } });
    // Click the checkbox input directly rather than its wrapping <label> text —
    // avoids depending on jsdom's label-click delegation behaving like a browser.
    fireEvent.click(container.querySelector('input[type="checkbox"]')!);
    fireEvent.change(screen.getByPlaceholderText('businessId'), { target: { value: 'BIZ-123' } });
    fireEvent.click(screen.getByText('invoiceTypeElectronic'));

    fireEvent.click(screen.getByText('save'));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/spe-operators/entity-1');
    expect((init as RequestInit).method).toBe('PATCH');
    const body = await jsonBody(fetchMock.mock.calls[0]);
    expect(body).toEqual({
      name: 'GP Information Network',
      contactEmail: 'contact@surf.nl',
      contactPhone: null,
      speProviderId: 'op-1',
      isTrusted: true,
      address: null,
      businessId: 'BIZ-123',
      vatNumber: null,
      invoiceType: 'ELECTRONIC',
      invoiceReferenceNumber: null,
      eInvoiceAddress: null,
      operatorId: null,
      peppolCode: null,
      actingUserId: 'u-1',
    });

    // The edit form closes back to read-only display after a successful save.
    expect(screen.queryByText('cancel')).not.toBeInTheDocument();
  });

  it('shows the server error message and does not refresh when the save fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Name already in use' }) }));
    render(
      <MasterdataManager apiBasePath="/api/data-holders" namespace="dataHolders" entities={[makeEntity()]} isAdmin={true} currentUserId="u-1" />,
    );
    fireEvent.click(screen.getByText('edit'));
    fireEvent.click(screen.getByText('save'));

    expect(await screen.findByText('Name already in use')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('MasterdataManager — delete flow', () => {
  it('deletes an entity and refreshes on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    render(
      <MasterdataManager apiBasePath="/api/data-holders" namespace="dataHolders" entities={[makeEntity()]} isAdmin={true} currentUserId="u-1" />,
    );
    fireEvent.click(screen.getByText('delete'));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith('/api/data-holders/entity-1', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actingUserId: 'u-1' }),
    });
  });
});

describe('MasterdataManager — add flow', () => {
  it('disables submit until a name is entered, then creates the entity and resets/closes the form', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    render(
      <MasterdataManager apiBasePath="/api/data-holders" namespace="dataHolders" entities={[]} isAdmin={true} currentUserId="u-1" />,
    );
    fireEvent.click(screen.getByText('+ addNew'));
    expect(screen.getByText('addNew')).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('name'), { target: { value: 'New Data Holder' } });
    fireEvent.change(screen.getByPlaceholderText('contactEmail'), { target: { value: 'info@newdh.nl' } });
    expect(screen.getByText('addNew')).not.toBeDisabled();

    fireEvent.click(screen.getByText('addNew'));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/data-holders');
    expect((init as RequestInit).method).toBe('POST');
    const body = await jsonBody(fetchMock.mock.calls[0]);
    expect(body).toEqual({
      name: 'New Data Holder',
      contactEmail: 'info@newdh.nl',
      contactPhone: null,
      actingUserId: 'u-1',
    });

    // Form resets and closes after a successful create.
    expect(screen.queryByPlaceholderText('name')).not.toBeInTheDocument();
    expect(screen.getByText('+ addNew')).toBeInTheDocument();
  });

  it('cancels the add form without submitting', () => {
    render(
      <MasterdataManager apiBasePath="/api/data-holders" namespace="dataHolders" entities={[]} isAdmin={true} currentUserId="u-1" />,
    );
    fireEvent.click(screen.getByText('+ addNew'));
    fireEvent.change(screen.getByPlaceholderText('name'), { target: { value: 'Should be discarded' } });
    fireEvent.click(screen.getByText('cancel'));
    expect(screen.queryByPlaceholderText('name')).not.toBeInTheDocument();
    expect(screen.getByText('+ addNew')).toBeInTheDocument();
  });
});

describe('MasterdataManager — nested SPE types', () => {
  it('renders the nested SpeTypeList when hasSpeTypes is set', () => {
    render(
      <MasterdataManager
        apiBasePath="/api/spe-operators"
        namespace="speOperators"
        entities={[makeEntity({ types: [] })]}
        hasSpeTypes
        isAdmin={false}
        currentUserId="u-1"
      />,
    );
    expect(screen.getByText('typesLabel')).toBeInTheDocument();
    expect(screen.getByText('typesEmpty')).toBeInTheDocument();
  });
});
