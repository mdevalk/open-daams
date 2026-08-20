// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { PermitCard } from './PermitCard';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

afterEach(cleanup);

type Permit = ComponentProps<typeof PermitCard>['permit'];

function makePermit(overrides: Partial<Permit> = {}): Permit {
  return {
    id: 'permit-1',
    permitNumber: 'DP-NL-2025-0001',
    version: 1,
    status: 'GRANTED',
    issuedAt: '2026-01-01T00:00:00Z',
    validFrom: '2026-01-01T00:00:00Z',
    validUntil: '2027-01-01T00:00:00Z',
    revocationReason: null,
    previousPermit: null,
    application: { referenceNumber: 'REF-001', title: 'Study X', type: 'DATA_ACCESS_APPLICATION' },
    ...overrides,
  } as unknown as Permit;
}

describe('PermitCard', () => {
  it('renders permit id (v1 without suffix), status, and application reference in full mode', () => {
    render(<PermitCard permit={makePermit()} />);
    expect(screen.getByText('DP-NL-2025-0001')).toBeInTheDocument();
    expect(screen.getByText('GRANTED')).toBeInTheDocument();
    expect(screen.getByText('REF-001')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
  });

  it('formats the permit id with -v{n} suffix for versions above 1', () => {
    render(<PermitCard permit={makePermit({ version: 2 })} />);
    expect(screen.getByText('DP-NL-2025-0001-v2')).toBeInTheDocument();
  });

  it('hides application reference number and version in compact mode', () => {
    render(<PermitCard permit={makePermit()} compact />);
    expect(screen.queryByText('REF-001')).not.toBeInTheDocument();
    expect(screen.queryByText('v1')).not.toBeInTheDocument();
  });

  it('shows revocation reason only when status is REVOKED', () => {
    const { unmount } = render(
      <PermitCard permit={makePermit({ status: 'REVOKED', revocationReason: 'Breach of terms' })} />,
    );
    expect(screen.getByText('Breach of terms')).toBeInTheDocument();
    unmount();

    render(<PermitCard permit={makePermit({ status: 'GRANTED', revocationReason: null })} />);
    expect(screen.queryByText('Breach of terms')).not.toBeInTheDocument();
  });

  it('renders the predecessor as a link when a locale is provided, and as plain text when not', () => {
    // Give the predecessor a distinct number from the permit's own so the two
    // rendered occurrences of "DP-NL-2025-0001" aren't ambiguous to query.
    const permit = makePermit({
      previousPermit: { id: 'prev-1', permitNumber: 'DP-NL-2024-0009', version: 1 },
    });

    const { unmount } = render(<PermitCard permit={permit} locale="nl" />);
    const predecessorText = screen.getByText('DP-NL-2024-0009');
    expect(predecessorText.closest('a')).toHaveAttribute('href', '/nl/permits/prev-1');
    unmount();

    render(<PermitCard permit={permit} />);
    expect(screen.getByText('DP-NL-2024-0009').closest('a')).toBeNull();
  });
});
