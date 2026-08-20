import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    application: { findFirst: vi.fn() },
  },
}));

import { prisma } from '@/lib/db';
import { parseHdeuPayload, createApplicationFromHdeuPayload } from '@/lib/hdeu';
import samplePayload from './poc-demo-hdeu-payload.json';

const findFirst = vi.mocked(prisma.application.findFirst);

beforeEach(() => {
  findFirst.mockReset();
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
