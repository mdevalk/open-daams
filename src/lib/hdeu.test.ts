import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    application: { findFirst: vi.fn() },
    studyCohort: { create: vi.fn() },
    dataHolder: { findMany: vi.fn(), createMany: vi.fn() },
    requestedDataset: { createMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/db';
import {
  parseHdeuPayload,
  createApplicationFromHdeuPayload,
  createStudyCohorts,
  createRequestedDatasets,
  type HdeuStudyCohort,
} from '@/lib/hdeu';
import samplePayload from './poc-demo-hdeu-payload.json';

const findFirst = vi.mocked(prisma.application.findFirst);
const studyCohortCreate = vi.mocked(prisma.studyCohort.create);
const dataHolderFindMany = vi.mocked(prisma.dataHolder.findMany);
const dataHolderCreateMany = vi.mocked(prisma.dataHolder.createMany);
const requestedDatasetCreateMany = vi.mocked(prisma.requestedDataset.createMany);

beforeEach(() => {
  findFirst.mockReset();
  studyCohortCreate.mockReset();
  dataHolderFindMany.mockReset();
  dataHolderCreateMany.mockReset();
  requestedDatasetCreateMany.mockReset();
});

describe('parseHdeuPayload', () => {
  it('accepts a well-formed payload', () => {
    const result = parseHdeuPayload(samplePayload);
    expect(result.ok).toBe(true);
  });

  it('rejects a non-object payload', () => {
    expect(parseHdeuPayload(null)).toEqual({ ok: false, errors: ['Payload must be a JSON object'] });
    expect(parseHdeuPayload('nope')).toEqual({ ok: false, errors: ['Payload must be a JSON object'] });
    expect(parseHdeuPayload([1, 2]).ok).toBe(false);
  });

  it('reports every missing required field', () => {
    const rest = { ...(samplePayload as Record<string, unknown>) };
    delete rest.hdeuApplicationId;
    delete rest.sendingCountry;
    const result = parseHdeuPayload(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('Missing required field: hdeuApplicationId');
      expect(result.errors).toContain('Missing required field: sendingCountry');
    }
  });

  it('rejects an applicationType outside the allowed enum', () => {
    const result = parseHdeuPayload({ ...samplePayload, applicationType: 'SOMETHING_ELSE' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('applicationType must be DATA_ACCESS_APPLICATION or DATA_REQUEST');
    }
  });

  it('rejects requestedDatasets that are not the expected shape', () => {
    const notAnArray = parseHdeuPayload({ ...samplePayload, requestedDatasets: 'nope' });
    expect(notAnArray.ok).toBe(false);
    if (!notAnArray.ok) expect(notAnArray.errors).toContain('requestedDatasets must be an array');

    const badShape = parseHdeuPayload({
      ...samplePayload,
      requestedDatasets: [{ dataHolderName: 'X', datasets: [{ noNameField: true }] }],
    });
    expect(badShape.ok).toBe(false);
    if (!badShape.ok) {
      expect(badShape.errors).toContain(
        'requestedDatasets must be an array of { dataHolderName, datasets: [{ name, url? }] }',
      );
    }
  });
});

describe('createApplicationFromHdeuPayload', () => {
  it('rejects re-importing an already-imported hdeuApplicationId', async () => {
    findFirst.mockResolvedValue({ id: 'app-1', referenceNumber: 'HDAB-2026-0004' } as never);

    const result = await createApplicationFromHdeuPayload(samplePayload as never, samplePayload);

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: 'Already imported as HDAB-2026-0004',
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { hdeuApplicationId: samplePayload.hdeuApplicationId },
    });
  });
});

describe('createStudyCohorts', () => {
  it('does nothing when studyCohorts is absent or empty', async () => {
    await createStudyCohorts('app-1', undefined);
    await createStudyCohorts('app-1', []);
    expect(studyCohortCreate).not.toHaveBeenCalled();
  });

  it('creates COHORT rows before dependent rows, resolving relatesToIndex via the created COHORT id', async () => {
    studyCohortCreate.mockResolvedValueOnce({ id: 'cohort-db-id' } as never);
    studyCohortCreate.mockResolvedValueOnce({ id: 'control-db-id' } as never);

    const cohorts: HdeuStudyCohort[] = [
      { countryId: 'NL', role: 'COHORT', size: 100 },
      { countryId: 'NL', role: 'CONTROL', relatesToIndex: 0, matchingCriteria: 'age-matched' },
    ];

    await createStudyCohorts('app-1', cohorts);

    expect(studyCohortCreate).toHaveBeenCalledTimes(2);
    // First call: the COHORT row, no relatesToId.
    expect(studyCohortCreate.mock.calls[0][0]).toMatchObject({
      data: expect.objectContaining({ applicationId: 'app-1', role: 'COHORT' }),
    });
    // Second call: the CONTROL row, relatesToId resolved from the COHORT's real db id (not the array index).
    expect(studyCohortCreate.mock.calls[1][0]).toMatchObject({
      data: expect.objectContaining({ applicationId: 'app-1', role: 'CONTROL', relatesToId: 'cohort-db-id' }),
    });
  });

  it('leaves relatesToId undefined for a dependent row with no relatesToIndex', async () => {
    studyCohortCreate.mockResolvedValueOnce({ id: 'cohort-db-id' } as never);
    studyCohortCreate.mockResolvedValueOnce({ id: 'relative-db-id' } as never);

    const cohorts: HdeuStudyCohort[] = [
      { countryId: 'NL', role: 'COHORT' },
      { countryId: 'NL', role: 'RELATIVE' },
    ];

    await createStudyCohorts('app-1', cohorts);

    expect(studyCohortCreate.mock.calls[1][0]).toMatchObject({
      data: expect.objectContaining({ relatesToId: undefined }),
    });
  });
});

describe('createRequestedDatasets', () => {
  it('does nothing when requestedDatasets is empty', async () => {
    await createRequestedDatasets('app-1', []);
    expect(dataHolderFindMany).not.toHaveBeenCalled();
    expect(requestedDatasetCreateMany).not.toHaveBeenCalled();
  });

  it('reuses an existing data holder by name without creating a new one', async () => {
    dataHolderFindMany.mockResolvedValueOnce([{ id: 'dh-1', name: 'GP Network' }] as never);

    await createRequestedDatasets('app-1', [
      { dataHolderName: 'GP Network', datasets: [{ name: 'Registry A' }] },
    ]);

    expect(dataHolderCreateMany).not.toHaveBeenCalled();
    expect(requestedDatasetCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ applicationId: 'app-1', dataHolderId: 'dh-1', name: 'Registry A' }),
      ],
    });
  });

  it('creates missing data holders, then re-fetches to resolve their ids', async () => {
    dataHolderFindMany
      .mockResolvedValueOnce([]) // pre-fetch: none exist yet
      .mockResolvedValueOnce([{ id: 'dh-new', name: 'New Holder' }] as never); // re-fetch after create

    await createRequestedDatasets('app-1', [
      { dataHolderName: 'New Holder', datasets: [{ name: 'Registry B' }] },
    ]);

    expect(dataHolderCreateMany).toHaveBeenCalledWith({
      data: [{ name: 'New Holder' }],
      skipDuplicates: true,
    });
    expect(dataHolderFindMany).toHaveBeenCalledTimes(2);
    expect(requestedDatasetCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ applicationId: 'app-1', dataHolderId: 'dh-new', name: 'Registry B' }),
      ],
    });
  });
});
