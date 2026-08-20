// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { UserSwitcher } from './UserSwitcher';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/nl/applications/app-1',
  useSearchParams: () => new URLSearchParams('tab=notes'),
}));

afterEach(cleanup);

type Users = ComponentProps<typeof UserSwitcher>['users'];

const USERS = [
  { id: 'u-1', name: 'S. Bakker', role: 'CASE_HANDLER' },
  { id: 'u-2', name: 'A. de Vries', role: 'APPLICANT' },
] as unknown as Users;

beforeEach(() => {
  push.mockReset();
});

describe('UserSwitcher — rendering', () => {
  it('renders each user with their translated role, highlighting the current user', () => {
    render(<UserSwitcher users={USERS} currentUserId="u-1" />);

    expect(screen.getByText('S. Bakker')).toBeInTheDocument();
    expect(screen.getByText('CASE_HANDLER')).toBeInTheDocument();
    expect(screen.getByText('A. de Vries')).toBeInTheDocument();
    expect(screen.getByText('APPLICANT')).toBeInTheDocument();

    const activeButton = screen.getByText('S. Bakker').closest('button')!;
    const inactiveButton = screen.getByText('A. de Vries').closest('button')!;
    expect(activeButton.className).toContain('bg-[#154273]');
    expect(inactiveButton.className).not.toContain('bg-[#154273]');
  });
});

describe('UserSwitcher — switching users', () => {
  it('navigates to the current path with userId set, preserving other query params', () => {
    render(<UserSwitcher users={USERS} currentUserId="u-1" />);

    fireEvent.click(screen.getByText('A. de Vries'));

    expect(push).toHaveBeenCalledWith('/nl/applications/app-1?tab=notes&userId=u-2');
  });
});
