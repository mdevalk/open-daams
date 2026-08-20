// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { StatusBadge } from './StatusBadge';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

afterEach(cleanup);

describe('StatusBadge', () => {
  it('renders the translated status label for DRAFT with the gray styling', () => {
    render(<StatusBadge status="DRAFT" />);
    const badge = screen.getByText('DRAFT');
    expect(badge).toHaveClass('bg-gray-100');
  });

  it('renders SUBMITTED with the blue "in progress" styling', () => {
    render(<StatusBadge status="SUBMITTED" />);
    const badge = screen.getByText('SUBMITTED');
    expect(badge).toHaveClass('bg-[#e8f4fb]');
  });

  it('renders AWAITING_ADDITIONAL_INFORMATION with the amber styling', () => {
    render(<StatusBadge status="AWAITING_ADDITIONAL_INFORMATION" />);
    const badge = screen.getByText('AWAITING_ADDITIONAL_INFORMATION');
    expect(badge).toHaveClass('bg-[#fff3cd]');
  });

  it('renders DECISION_ISSUED with the green "done" styling', () => {
    render(<StatusBadge status="DECISION_ISSUED" />);
    const badge = screen.getByText('DECISION_ISSUED');
    expect(badge).toHaveClass('bg-[#e6f5ea]');
  });
});
