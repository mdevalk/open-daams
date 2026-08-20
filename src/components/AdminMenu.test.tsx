// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AdminMenu } from './AdminMenu';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

afterEach(cleanup);

describe('AdminMenu', () => {
  it('is closed by default and opens the panel with locale-prefixed links on toggle click', () => {
    render(<AdminMenu locale="nl" />);
    expect(screen.queryByText('masterdata')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('masterdata')).toBeInTheDocument();
    expect(screen.getByText('masterdata').closest('a')).toHaveAttribute('href', '/nl/masterdata');
    expect(screen.getByText('auditLog').closest('a')).toHaveAttribute('href', '/nl/audit-log');
    expect(screen.getByText('securityLog').closest('a')).toHaveAttribute('href', '/nl/security-log');
    expect(screen.getByText('integrationLog').closest('a')).toHaveAttribute('href', '/nl/integration-log');
  });

  it('closes the panel when clicking an item, and toggles closed on a second button click', () => {
    render(<AdminMenu locale="en" />);
    const button = screen.getByRole('button');

    fireEvent.click(button);
    fireEvent.click(screen.getByText('masterdata'));
    expect(screen.queryByText('masterdata')).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.getByText('masterdata')).toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.queryByText('masterdata')).not.toBeInTheDocument();
  });

  it('closes when Escape is pressed, and when clicking outside the menu', () => {
    render(
      <div>
        <div data-testid="outside">outside area</div>
        <AdminMenu locale="nl" />
      </div>,
    );
    const button = screen.getByRole('button');

    fireEvent.click(button);
    expect(screen.getByText('masterdata')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('masterdata')).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.getByText('masterdata')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText('masterdata')).not.toBeInTheDocument();
  });

  it('sets aria-expanded to reflect open state', () => {
    render(<AdminMenu locale="nl" />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });
});
