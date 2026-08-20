// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { AuthorizedPersonsPanel } from './AuthorizedPersonsPanel';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

afterEach(cleanup);

type Persons = ComponentProps<typeof AuthorizedPersonsPanel>['persons'];

function makePerson(overrides: Partial<Persons[number]> = {}): Persons[number] {
  return {
    id: 'ap-1',
    name: 'Dr. A. de Vries',
    role: 'RESEARCHER',
    affiliation: 'UMC Utrecht',
    did: null,
    ...overrides,
  } as unknown as Persons[number];
}

describe('AuthorizedPersonsPanel — empty state', () => {
  it('shows the empty message when there are no persons', async () => {
    const element = await AuthorizedPersonsPanel({ persons: [] as Persons, locale: 'nl' });
    render(element);
    expect(screen.getByText('empty')).toBeInTheDocument();
  });
});

describe('AuthorizedPersonsPanel — listing persons', () => {
  it('renders a person with name, affiliation and researcher role badge', async () => {
    const element = await AuthorizedPersonsPanel({ persons: [makePerson()], locale: 'nl' });
    render(element);
    expect(screen.getByText('Dr. A. de Vries')).toBeInTheDocument();
    expect(screen.getByText('UMC Utrecht')).toBeInTheDocument();
    expect(screen.getByText('roleResearcher')).toBeInTheDocument();
  });

  it('renders the output controller role badge for that role', async () => {
    const element = await AuthorizedPersonsPanel({
      persons: [makePerson({ id: 'ap-2', name: 'B. Jansen', role: 'OUTPUT_CONTROLLER' })],
      locale: 'nl',
    });
    render(element);
    expect(screen.getByText('roleOutputController')).toBeInTheDocument();
  });

  it('shows the did line only when did is set', async () => {
    const { rerender } = render(await AuthorizedPersonsPanel({ persons: [makePerson({ did: null })], locale: 'nl' }));
    expect(screen.queryByText(/did:/)).not.toBeInTheDocument();

    rerender(await AuthorizedPersonsPanel({ persons: [makePerson({ did: 'did:web:umcu.nl:a-de-vries' })], locale: 'nl' }));
    expect(screen.getByText(/did:web:umcu.nl:a-de-vries/)).toBeInTheDocument();
  });

  it('renders multiple persons as separate list items', async () => {
    const element = await AuthorizedPersonsPanel({
      persons: [makePerson(), makePerson({ id: 'ap-2', name: 'B. Jansen', role: 'OUTPUT_CONTROLLER' })],
      locale: 'nl',
    });
    render(element);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
