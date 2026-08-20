// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DeadlineBanner } from './DeadlineBanner';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

afterEach(cleanup);

describe('DeadlineBanner', () => {
  it('renders nothing when the deadline is null', () => {
    const { container } = render(<DeadlineBanner label="Decision deadline" deadline={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the deadline is undefined', () => {
    const { container } = render(<DeadlineBanner label="Decision deadline" deadline={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an "ok" style banner with days remaining for a far-future deadline', () => {
    const future = new Date(Date.now() + 30 * 86_400_000);
    const { container } = render(<DeadlineBanner label="Decision deadline" deadline={future} />);
    expect(screen.getByText('Decision deadline')).toBeInTheDocument();
    expect(container.querySelector('.deadline-ok')).toBeInTheDocument();
    expect(screen.getByText(/daysRemaining/)).toBeInTheDocument();
  });

  it('shows a "warning" style banner within the 14-day window', () => {
    const soon = new Date(Date.now() + 5 * 86_400_000);
    const { container } = render(<DeadlineBanner label="Decision deadline" deadline={soon} />);
    expect(container.querySelector('.deadline-warning')).toBeInTheDocument();
  });

  it('shows an "overdue" style banner with days overdue for a past deadline', () => {
    const past = new Date(Date.now() - 3 * 86_400_000);
    const { container } = render(<DeadlineBanner label="Decision deadline" deadline={past} />);
    expect(container.querySelector('.deadline-overdue')).toBeInTheDocument();
    expect(screen.getByText(/daysOverdue/)).toBeInTheDocument();
  });
});
