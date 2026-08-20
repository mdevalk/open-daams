// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { NewApplicationForm } from './NewApplicationForm';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

afterEach(cleanup);

type Applicants = ComponentProps<typeof NewApplicationForm>['applicants'];
type CurrentUser = ComponentProps<typeof NewApplicationForm>['currentUser'];

// role: 'APPLICANT' skips the required applicantId <select> (the form shows
// the current user's own name as static text instead), keeping the fixture
// small — the required fields are then just type / title / projectDescription
// / purposeCategory.
const APPLICANT_USER = { id: 'u-2', role: 'APPLICANT', name: 'A. de Vries', email: 'researcher@umcu.nl' } as unknown as CurrentUser;
const DATA_HOLDERS = [{ id: 'dh-1', name: 'GP Information Network (LINH)' }];

beforeEach(() => {
  push.mockReset();
});

describe('NewApplicationForm — data holder / dataset groups', () => {
  it('adds and removes data-holder groups and datasets within a group', () => {
    render(<NewApplicationForm applicants={[] as Applicants} dataHolders={DATA_HOLDERS} currentUser={APPLICANT_USER} />);

    // "selectDataHolder" is the group-select's own default-option text
    // (unique to that one spot in the component), so counting it counts
    // groups without depending on how many other <select>s the (large,
    // type-conditional) rest of the form happens to render.
    expect(screen.getAllByText('selectDataHolder')).toHaveLength(1);
    expect(screen.getAllByPlaceholderText('datasetNamePlaceholder')).toHaveLength(1);

    fireEvent.click(screen.getByText('+ addDataHolder'));
    expect(screen.getAllByText('selectDataHolder')).toHaveLength(2);
    expect(screen.getAllByPlaceholderText('datasetNamePlaceholder')).toHaveLength(2); // each new group starts with 1 dataset

    fireEvent.click(screen.getAllByText('+ addDataset')[0]);
    expect(screen.getAllByPlaceholderText('datasetNamePlaceholder')).toHaveLength(3);

    // Remove buttons only render once there's more than one row to remove —
    // and both a dataset row and its group's own header share the same
    // "remove" text, so scope to the second dataset row specifically
    // (its own "flex items-center gap-2" row div) rather than indexing
    // into the page's full button list.
    const secondDatasetRow = screen.getAllByPlaceholderText('datasetNamePlaceholder')[1].closest('.flex.items-center.gap-2') as HTMLElement;
    fireEvent.click(within(secondDatasetRow).getByText('remove'));
    expect(screen.getAllByPlaceholderText('datasetNamePlaceholder')).toHaveLength(2);

    // Only the two groups' own header-remove buttons are left now; remove
    // the second group entirely.
    fireEvent.click(screen.getAllByText('remove')[1]);
    expect(screen.getAllByText('selectDataHolder')).toHaveLength(1);
    expect(screen.getAllByPlaceholderText('datasetNamePlaceholder')).toHaveLength(1);
  });
});

describe('NewApplicationForm — submit payload shaping', () => {
  it('drops groups without a data holder and datasets without a name, and navigates to the created application', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'new-app-id' }) }),
    );

    const { container } = render(
      <NewApplicationForm applicants={[] as Applicants} dataHolders={DATA_HOLDERS} currentUser={APPLICANT_USER} />,
    );

    fireEvent.click(container.querySelector('input[value="DATA_ACCESS_APPLICATION"]')!);
    fireEvent.change(container.querySelector('input[name="title"]')!, { target: { value: 'Test study' } });
    fireEvent.change(container.querySelector('textarea[name="projectDescription"]')!, {
      target: { value: 'A description' },
    });
    fireEvent.change(container.querySelector('select[name="purposeCategory"]')!, {
      target: { value: 'SCIENTIFIC_RESEARCH' },
    });

    // Group 1: give it a data holder and a named dataset — this one should
    // survive the submit-time filter. Scoped to the group's own wrapper div
    // (not a global select query) since selecting DATA_ACCESS_APPLICATION
    // above reveals several more <select>s elsewhere in this large form.
    const groupDiv = screen.getByPlaceholderText('datasetNamePlaceholder').closest('.rounded-lg.border.border-gray-200.p-3')!;
    fireEvent.change(groupDiv.querySelector('select')!, { target: { value: 'dh-1' } });
    fireEvent.change(screen.getByPlaceholderText('datasetNamePlaceholder'), { target: { value: 'GP records' } });

    // Group 2: added but left with no data holder chosen — should be
    // dropped entirely from requestedDatasets, not sent as an empty group.
    fireEvent.click(screen.getByText('+ addDataHolder'));

    fireEvent.click(screen.getByText('createButton'));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/applications/new-app-id'));

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body.requestedDatasets).toEqual([
      { dataHolderId: 'dh-1', datasets: [{ name: 'GP records', url: null }] },
    ]);
  });
});
