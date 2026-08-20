// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { SpeProvisioningPanel } from './SpeProvisioningPanel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(cleanup);

type Order = ComponentProps<typeof SpeProvisioningPanel>['order'];

function makeOrder(overrides: Partial<NonNullable<Order>> = {}): NonNullable<Order> {
  return {
    id: 'order-1',
    status: 'REQUESTED',
    environmentReference: null,
    speOperatorId: null,
    speOperator: null,
    requestedAt: '2026-01-01T10:00:00Z',
    provisionedAt: null,
    decommissionedAt: null,
    logs: [],
    ...overrides,
  } as NonNullable<Order>;
}

beforeEach(() => {
  refresh.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

describe('SpeProvisioningPanel — no order yet', () => {
  it('shows a request button for managers', () => {
    render(<SpeProvisioningPanel permitId="p-1" order={null} speOperators={[]} canManage={true} currentUserId="u-1" />);
    expect(screen.getByText('request')).toBeInTheDocument();
  });

  it('shows a plain message for non-managers, with no request button', () => {
    render(<SpeProvisioningPanel permitId="p-1" order={null} speOperators={[]} canManage={false} currentUserId="u-1" />);
    expect(screen.getByText('noOrder')).toBeInTheDocument();
    expect(screen.queryByText('request')).not.toBeInTheDocument();
  });

  it('POSTs a provisioning request and refreshes on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    render(<SpeProvisioningPanel permitId="p-1" order={null} speOperators={[]} canManage={true} currentUserId="u-1" />);
    fireEvent.click(screen.getByText('request'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/permits/p-1/spe-provisioning', expect.objectContaining({ method: 'POST' }));
  });
});

describe('SpeProvisioningPanel — existing order', () => {
  it('renders environment reference, operator, and status badge', () => {
    const order = makeOrder({
      environmentReference: 'env-abc',
      speOperator: { name: 'SURF Research Cloud' },
      status: 'ACTIVE',
    });
    render(<SpeProvisioningPanel permitId="p-1" order={order} speOperators={[]} canManage={true} currentUserId="u-1" />);
    expect(screen.getByText('env-abc')).toBeInTheDocument();
    expect(screen.getByText('SURF Research Cloud')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('shows no transition buttons for non-managers', () => {
    const order = makeOrder({ status: 'REQUESTED' });
    render(<SpeProvisioningPanel permitId="p-1" order={order} speOperators={[]} canManage={false} currentUserId="u-1" />);
    expect(screen.queryByText('startProvisioning')).not.toBeInTheDocument();
  });

  it('shows available transition buttons for managers, and expands the confirm form on selection', () => {
    const order = makeOrder({ status: 'REQUESTED' });
    render(<SpeProvisioningPanel permitId="p-1" order={order} speOperators={[]} canManage={true} currentUserId="u-1" />);
    expect(screen.getByText('startProvisioning')).toBeInTheDocument();
    expect(screen.getByText('cancelRequest')).toBeInTheDocument();

    // No confirm form until a transition is selected.
    expect(screen.queryByText('confirm')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('startProvisioning'));
    expect(screen.getByText('confirm')).toBeInTheDocument();
  });

  it('requires an environment reference field only for transitions that need it (PROVISIONING -> ACTIVE)', () => {
    const order = makeOrder({ status: 'PROVISIONING' });
    render(<SpeProvisioningPanel permitId="p-1" order={order} speOperators={[]} canManage={true} currentUserId="u-1" />);
    fireEvent.click(screen.getByText('markActive'));
    expect(screen.getByPlaceholderText('envRefPlaceholder')).toBeInTheDocument();

    // cancelProvisioning does not require an environment reference field.
    fireEvent.click(screen.getByText('markActive')); // toggle back off
    fireEvent.click(screen.getByText('cancelProvisioning'));
    expect(screen.queryByPlaceholderText('envRefPlaceholder')).not.toBeInTheDocument();
  });

  it('PATCHes the chosen transition with entered details and refreshes on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    const order = makeOrder({ status: 'PROVISIONING' });
    render(<SpeProvisioningPanel permitId="p-1" order={order} speOperators={[]} canManage={true} currentUserId="u-1" />);
    fireEvent.click(screen.getByText('markActive'));
    fireEvent.change(screen.getByPlaceholderText('envRefPlaceholder'), { target: { value: 'new-env-ref' } });
    fireEvent.click(screen.getByText('confirm'));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const fetchMock = vi.mocked(fetch);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual(
      expect.objectContaining({ actingUserId: 'u-1', toStatus: 'ACTIVE', environmentReference: 'new-env-ref' }),
    );
  });

  it('shows no transition section for a terminal DECOMMISSIONED order', () => {
    const order = makeOrder({ status: 'DECOMMISSIONED' });
    render(<SpeProvisioningPanel permitId="p-1" order={order} speOperators={[]} canManage={true} currentUserId="u-1" />);
    expect(screen.queryByText('confirmDecommissioned')).not.toBeInTheDocument();
  });

  it('renders the history log entries inside the details/summary', () => {
    const order = makeOrder({
      status: 'ACTIVE',
      logs: [
        {
          id: 'log-1',
          fromStatus: 'PROVISIONING',
          toStatus: 'ACTIVE',
          comment: 'Went live',
          createdAt: '2026-01-05T10:00:00Z',
          user: { name: 'S. Bakker', role: 'CASE_HANDLER' },
        },
      ],
    });
    render(<SpeProvisioningPanel permitId="p-1" order={order} speOperators={[]} canManage={true} currentUserId="u-1" />);
    expect(screen.getByText('history')).toBeInTheDocument();
    expect(screen.getByText('Went live')).toBeInTheDocument();
    expect(screen.getByText(/S\. Bakker/)).toBeInTheDocument();
  });

  it('shows an error message when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Nope' }) }));
    render(<SpeProvisioningPanel permitId="p-1" order={null} speOperators={[]} canManage={true} currentUserId="u-1" />);
    fireEvent.click(screen.getByText('request'));
    expect(await screen.findByText('Nope')).toBeInTheDocument();
  });
});
