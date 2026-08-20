// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { PermitChangeRequestPanel } from './PermitChangeRequestPanel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  usePathname: () => '/nl/permits/permit-1',
}));

afterEach(cleanup);

type Requests = ComponentProps<typeof PermitChangeRequestPanel>['requests'];
type PendingVersion = ComponentProps<typeof PermitChangeRequestPanel>['pendingVersion'];

const CURRENT_USER_ID = 'u-decision-maker';

function baseProps(overrides: Partial<ComponentProps<typeof PermitChangeRequestPanel>> = {}) {
  return {
    permitId: 'permit-1',
    permitStatus: 'GRANTED',
    requests: [] as Requests,
    canRequest: false,
    canDecide: false,
    currentUserId: CURRENT_USER_ID,
    pendingVersion: null as PendingVersion,
    isDataRequest: false,
    speOperators: [],
    dataHolders: [],
    dataUsers: [],
    ...overrides,
  } as ComponentProps<typeof PermitChangeRequestPanel>;
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    type: 'AMENDMENT',
    status: 'REQUESTED',
    justification: 'Need to add a new SPE operator',
    decisionComment: null,
    newValidUntil: null,
    requestedAt: new Date('2026-01-05'),
    decidedAt: null,
    requestedBy: { name: 'A. de Vries' },
    decidedBy: null,
    ...overrides,
  } as unknown as Requests[number];
}

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});

describe('PermitChangeRequestPanel — empty / no requestable types', () => {
  it('shows the empty state and no "document new" section when nothing is requestable', () => {
    // EXPIRED isn't in requestableTypes' switch, so it falls to the default: [].
    render(<PermitChangeRequestPanel {...baseProps({ permitStatus: 'EXPIRED', canRequest: true })} />);

    expect(screen.getByText('empty')).toBeInTheDocument();
    expect(screen.queryByText('documentNew')).not.toBeInTheDocument();
  });
});

describe('PermitChangeRequestPanel — submitting a new change request', () => {
  it('lets the user pick a type, requires a justification, submits, and resets the form on success', async () => {
    render(<PermitChangeRequestPanel {...baseProps({ permitStatus: 'GRANTED', canRequest: true })} />);

    expect(screen.getByText('documentNew')).toBeInTheDocument();
    const typeSelect = screen.getByDisplayValue('selectType');
    const submitButton = screen.getByText('submit');
    expect(submitButton).toBeDisabled();

    fireEvent.change(typeSelect, { target: { value: 'AMENDMENT' } });
    // The type hint (tth) renders once a type is chosen — scoped to the <p>
    // since the <select>'s own <option text='AMENDMENT'> also matches by text.
    expect(screen.getByText('AMENDMENT', { selector: 'p' })).toBeInTheDocument();
    expect(submitButton).toBeDisabled(); // justification still empty

    fireEvent.change(screen.getByPlaceholderText('justificationPlaceholder'), {
      target: { value: 'Adding a second SPE operator' },
    });
    expect(submitButton).not.toBeDisabled();

    fireEvent.click(submitButton);

    await waitFor(() => expect(refresh).toHaveBeenCalled());

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/permits/permit-1/change-requests',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init!.body as string)).toEqual({
      type: 'AMENDMENT',
      justification: 'Adding a second SPE operator',
      requestedById: CURRENT_USER_ID,
    });

    // Form resets after a successful submit.
    expect(screen.getByDisplayValue('selectType')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('justificationPlaceholder')).toHaveValue('');
  });

  it('shows the server error message when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Justification too short' }) }),
    );

    render(<PermitChangeRequestPanel {...baseProps({ permitStatus: 'GRANTED', canRequest: true })} />);

    fireEvent.change(screen.getByDisplayValue('selectType'), { target: { value: 'RENEWAL' } });
    fireEvent.change(screen.getByPlaceholderText('justificationPlaceholder'), { target: { value: 'x' } });
    fireEvent.click(screen.getByText('submit'));

    await waitFor(() => expect(screen.getByText('Justification too short')).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('PermitChangeRequestPanel — pending version activation', () => {
  it('shows the pending-activation notice and activates it when the effective date has passed', async () => {
    const pendingVersion: PendingVersion = {
      id: 'permit-2-pending',
      permitNumber: 'DP-NL-2025-0001',
      version: 2,
      effectiveAt: new Date('2020-01-01'),
    };

    render(<PermitChangeRequestPanel {...baseProps({ pendingVersion, canDecide: true })} />);

    // Exact match: "pendingActivation" vs. the separate "pendingActivationDate" paragraph.
    expect(screen.getByText('pendingActivation')).toBeInTheDocument();
    const activateButton = screen.getByText('activateNow');
    expect(activateButton).not.toBeDisabled();

    fireEvent.click(activateButton);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/nl/permits/permit-2-pending'));
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/permits/permit-2-pending/activate',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ actingUserId: CURRENT_USER_ID }) }),
    );
  });

  it('disables the activate button while the effective date is still in the future', () => {
    const pendingVersion: PendingVersion = {
      id: 'permit-2-pending',
      permitNumber: 'DP-NL-2025-0001',
      version: 2,
      effectiveAt: new Date('2099-01-01'),
    };

    render(<PermitChangeRequestPanel {...baseProps({ pendingVersion, canDecide: true })} />);

    expect(screen.getByText('activateNow')).toBeDisabled();
  });

  it('does not show the activate button when the user cannot decide', () => {
    const pendingVersion: PendingVersion = {
      id: 'permit-2-pending',
      permitNumber: 'DP-NL-2025-0001',
      version: 2,
      effectiveAt: new Date('2020-01-01'),
    };

    render(<PermitChangeRequestPanel {...baseProps({ pendingVersion, canDecide: false })} />);

    expect(screen.queryByText('activateNow')).not.toBeInTheDocument();
  });
});

describe('PermitChangeRequestPanel — deciding a RENEWAL request', () => {
  it('requires a new expiry date before approving, then PATCHes the decision and navigates to the new permit version', async () => {
    const requests = [
      makeRequest({ id: 'req-renewal', type: 'RENEWAL', justification: 'Study extended by a year' }),
    ];
    render(<PermitChangeRequestPanel {...baseProps({ requests, canDecide: true })} />);

    fireEvent.click(screen.getByText('decide'));

    const dateInput = screen.getByText('newExpiry').closest('div')!.querySelector('input')!;
    const approveButton = screen.getByText('approve');
    expect(approveButton).toBeDisabled();

    fireEvent.change(dateInput, { target: { value: '2027-06-01' } });
    expect(approveButton).not.toBeDisabled();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ newPermitId: 'permit-2', pending: false }) }),
    );
    fireEvent.click(approveButton);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/nl/permits/permit-2'));

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/permits/permit-1/change-requests/req-renewal',
      expect.objectContaining({ method: 'PATCH' }),
    );
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({
      decision: 'APPROVED',
      actingUserId: CURRENT_USER_ID,
      comment: null,
      newValidUntil: '2027-06-01',
    });
    expect(body.speOperatorId).toBeUndefined();
    expect(body.effectiveDate).toBeUndefined();
  });
});

describe('PermitChangeRequestPanel — deciding an AMENDMENT request', () => {
  it('offers the SPE operator and output controller fields, lists affiliations alphabetically, and PATCHes them on approval', async () => {
    const requests = [
      makeRequest({ id: 'req-amendment', type: 'AMENDMENT', justification: 'Swap SPE operator' }),
    ];
    const speOperators = [{ id: 'op-1', name: 'SURF Research Cloud' }];
    const dataHolders = [{ id: 'dh-1', name: 'Zorginstelling B' }];
    const dataUsers = [{ id: 'du-1', name: 'Universiteit A' }];

    render(
      <PermitChangeRequestPanel
        {...baseProps({ requests, canDecide: true, isDataRequest: false, speOperators, dataHolders, dataUsers })}
      />,
    );

    fireEvent.click(screen.getByText('decide'));

    const speSelect = screen.getByText('speOperatorUnchanged').closest('select')!;
    fireEvent.change(speSelect, { target: { value: 'op-1' } });

    const outputControllerDiv = screen.getByPlaceholderText('outputControllerNameUnchanged').closest('div')!;
    const nameInput = outputControllerDiv.querySelector('input[type="text"]')!;
    const affiliationSelect = outputControllerDiv.querySelector('select')!;

    // Alphabetical merge of dataHolders + dataUsers: "Universiteit A" before "Zorginstelling B".
    const optionLabels = Array.from(affiliationSelect.querySelectorAll('option')).map((o) => o.textContent);
    expect(optionLabels).toEqual(['outputControllerAffiliationUnchanged', 'Universiteit A', 'Zorginstelling B']);

    fireEvent.change(nameInput, { target: { value: 'Dr. J. Jansen' } });
    fireEvent.change(affiliationSelect, { target: { value: 'Zorginstelling B' } });

    const approveButton = screen.getByText('approve');
    expect(approveButton).not.toBeDisabled(); // no RENEWAL-only restriction applies

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ newPermitId: 'permit-1', pending: true }) }),
    );
    fireEvent.click(approveButton);

    // Same permitId + pending:true → stays on this page (router.refresh, not push).
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();

    const fetchMock = vi.mocked(fetch);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({
      decision: 'APPROVED',
      speOperatorId: 'op-1',
      outputControllerName: 'Dr. J. Jansen',
      outputControllerAffiliation: 'Zorginstelling B',
    });
    expect(body.newValidUntil).toBeUndefined();
  });

  it('does not render the SPE operator field for a data request', () => {
    const requests = [makeRequest({ id: 'req-amendment', type: 'AMENDMENT' })];
    render(<PermitChangeRequestPanel {...baseProps({ requests, canDecide: true, isDataRequest: true })} />);

    fireEvent.click(screen.getByText('decide'));

    expect(screen.queryByText('speOperator')).not.toBeInTheDocument();
    expect(screen.getByText('outputController')).toBeInTheDocument();
  });
});

describe('PermitChangeRequestPanel — rejecting and cancelling', () => {
  it('rejects a request with a comment and refreshes', async () => {
    const requests = [makeRequest({ id: 'req-reject', type: 'AMENDMENT' })];
    render(<PermitChangeRequestPanel {...baseProps({ requests, canDecide: true, isDataRequest: true })} />);

    fireEvent.click(screen.getByText('decide'));
    fireEvent.change(screen.getByPlaceholderText('decisionNotePlaceholder'), {
      target: { value: 'Insufficient justification' },
    });
    fireEvent.click(screen.getByText('reject'));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const fetchMock = vi.mocked(fetch);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body.decision).toBe('REJECTED');
    expect(body.comment).toBe('Insufficient justification');
  });

  it('hides the decision inputs again when cancel is clicked', () => {
    const requests = [makeRequest({ id: 'req-cancel', type: 'AMENDMENT' })];
    render(<PermitChangeRequestPanel {...baseProps({ requests, canDecide: true, isDataRequest: true })} />);

    fireEvent.click(screen.getByText('decide'));
    expect(screen.getByPlaceholderText('decisionNotePlaceholder')).toBeInTheDocument();

    fireEvent.click(screen.getByText('cancel'));

    expect(screen.queryByPlaceholderText('decisionNotePlaceholder')).not.toBeInTheDocument();
    expect(screen.getByText('decide')).toBeInTheDocument();
  });
});
