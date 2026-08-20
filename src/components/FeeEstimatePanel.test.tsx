// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { FeeEstimatePanel } from './FeeEstimatePanel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// vitest.config.mts doesn't set test.globals, so RTL's afterEach(cleanup)
// auto-registration (which relies on a global afterEach) never fires —
// without this, each test's render() accumulates in the same jsdom body.
afterEach(cleanup);

type Application = ComponentProps<typeof FeeEstimatePanel>['application'];
type CurrentUser = ComponentProps<typeof FeeEstimatePanel>['currentUser'];

const CASE_HANDLER = { id: 'u-1', role: 'CASE_HANDLER', name: 'S. Bakker', email: 'casehandler@hdab.nl' } as unknown as CurrentUser;

function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1',
    status: 'PROCESSING',
    type: 'DATA_ACCESS_APPLICATION',
    feeEstimate: null,
    ...overrides,
  } as unknown as Application;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

describe('FeeEstimatePanel — manual line-item rows', () => {
  it('adds a new empty row when "addRow" is clicked', () => {
    render(
      <FeeEstimatePanel
        application={makeApplication()}
        currentUser={CASE_HANDLER}
        speOperators={[]}
        dataHolders={[]}
      />,
    );

    // No estimate yet, so rows starts empty (Row[] derived from
    // estimate?.lineItems ?? []) — nothing to query until a row is added.
    expect(screen.queryAllByPlaceholderText('amountPlaceholder')).toHaveLength(0);
    fireEvent.click(screen.getByText('+ addRow'));
    expect(screen.getAllByPlaceholderText('amountPlaceholder')).toHaveLength(1);
    fireEvent.click(screen.getByText('+ addRow'));
    expect(screen.getAllByPlaceholderText('amountPlaceholder')).toHaveLength(2);
  });

  it('removes a row when its remove button is clicked', () => {
    render(
      <FeeEstimatePanel
        application={makeApplication()}
        currentUser={CASE_HANDLER}
        speOperators={[]}
        dataHolders={[]}
      />,
    );

    fireEvent.click(screen.getByText('+ addRow'));
    fireEvent.click(screen.getByText('+ addRow'));
    expect(screen.getAllByPlaceholderText('amountPlaceholder')).toHaveLength(2);

    const removeButtons = screen.getAllByLabelText('removeRow');
    fireEvent.click(removeButtons[0]);
    expect(screen.getAllByPlaceholderText('amountPlaceholder')).toHaveLength(1);
  });
});

describe('FeeEstimatePanel — SPE type selection', () => {
  it('auto-fills the setup and usage fee fields from the chosen SPE type, and locks them read-only', () => {
    const speOperators = [
      {
        id: 'op-1',
        name: 'SURF Research Cloud',
        types: [{ id: 'type-1', name: 'Standard SPE', setupFee: 500, monthlyFee: 150 }],
      },
    ];

    render(
      <FeeEstimatePanel
        application={makeApplication()}
        currentUser={CASE_HANDLER}
        speOperators={speOperators}
        dataHolders={[]}
      />,
    );

    fireEvent.change(screen.getByDisplayValue('noneSelected'), { target: { value: 'op-1' } });

    // Selecting the operator swaps its own displayed value away from
    // "noneSelected", leaving the newly-rendered SPE type select as the only
    // remaining match — the two <select>s aren't otherwise addressable since
    // their <label>s aren't programmatically associated (a known a11y gap).
    const typeSelect = screen.getByDisplayValue('noneSelected');
    fireEvent.change(typeSelect, { target: { value: 'type-1' } });

    const setupFeeInput = screen.getByDisplayValue('500') as HTMLInputElement;
    const usageFeeInput = screen.getByDisplayValue('150') as HTMLInputElement;
    expect(setupFeeInput).toHaveAttribute('readonly');
    expect(usageFeeInput).toHaveAttribute('readonly');
  });
});
