import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Fixed so buildStorageLocations/resolveResearcher assertions can match
// exactly instead of just asserting shape — same non-determinism problem
// signPermit's tests solve differently (a disposable real keypair); here the
// value itself is opaque, so a fixed mock is simplest.
vi.mock('@/lib/did', () => ({
  generateSampleDid: vi.fn(() => 'did:key:zfixed'),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    authzFailureLog: { create: vi.fn() },
    application: { findUnique: vi.fn() },
    speOperator: { findUnique: vi.fn() },
    speType: { findUnique: vi.fn() },
  },
}));

import { prisma } from '@/lib/db';
import { POST, buildStorageLocations, resolveResearcher, resolveSpeSelection } from './route';

const userFindUnique = vi.mocked(prisma.user.findUnique);
const authzFailureLogCreate = vi.mocked(prisma.authzFailureLog.create);
const applicationFindUnique = vi.mocked(prisma.application.findUnique);
const speOperatorFindUnique = vi.mocked(prisma.speOperator.findUnique);
const speTypeFindUnique = vi.mocked(prisma.speType.findUnique);

const DECISION_MAKER = { id: 'u-1', role: 'DECISION_MAKER' as const, name: 'D. Maker', email: 'dm@hdab.nl' };
const APPLICANT = { id: 'u-2', role: 'APPLICANT' as const, name: 'A. de Vries', email: 'researcher@umcu.nl' };

beforeEach(() => {
  userFindUnique.mockReset();
  authzFailureLogCreate.mockReset();
  applicationFindUnique.mockReset();
  speOperatorFindUnique.mockReset();
  speTypeFindUnique.mockReset();
});

describe('buildStorageLocations', () => {
  it('builds one storage location per requested dataset, keyed by dataset id', () => {
    const requestedDatasets = [
      { id: 'rd-1', name: 'Dataset One', dataHolder: { name: 'Hospital A' } },
      { id: 'rd-2', name: 'Dataset Two', dataHolder: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any;

    const result = buildStorageLocations(requestedDatasets);

    expect(result.size).toBe(2);
    expect(result.get('rd-1')).toEqual({
      reference: 'urn:objectstore:bucket:hospital-a-dataset-one-rd-1',
      writerDid: 'did:key:zfixed',
    });
    // Falls back to "holder" when the dataset has no linked dataHolder.
    expect(result.get('rd-2')).toEqual({
      reference: 'urn:objectstore:bucket:holder-dataset-two-rd-2',
      writerDid: 'did:key:zfixed',
    });
  });

  it('returns an empty map for no requested datasets', () => {
    expect(buildStorageLocations([]).size).toBe(0);
  });
});

describe('resolveResearcher', () => {
  it('returns null when both personResearchName and personResponsibleName are null', () => {
    const application = {
      personResearchName: null,
      personResearchAffiliation: null,
      personResponsibleName: null,
      personResponsibleAffiliation: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    expect(resolveResearcher(application)).toBeNull();
  });

  it('prefers personResearchName/Affiliation over personResponsibleName/Affiliation when both are set', () => {
    const application = {
      personResearchName: 'Dr. Research',
      personResearchAffiliation: 'UMC Utrecht',
      personResponsibleName: 'Dr. Responsible',
      personResponsibleAffiliation: 'Erasmus MC',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    expect(resolveResearcher(application)).toEqual({
      name: 'Dr. Research',
      affiliation: 'UMC Utrecht',
      did: 'did:key:zfixed',
    });
  });

  it('falls back to personResponsibleName/Affiliation when personResearchName is not set', () => {
    const application = {
      personResearchName: null,
      personResearchAffiliation: null,
      personResponsibleName: 'Dr. Responsible',
      personResponsibleAffiliation: 'Erasmus MC',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    expect(resolveResearcher(application)).toEqual({
      name: 'Dr. Responsible',
      affiliation: 'Erasmus MC',
      did: 'did:key:zfixed',
    });
  });

  it('defaults affiliation to an empty string when only the name is set', () => {
    const application = {
      personResearchName: 'Dr. Research',
      personResearchAffiliation: null,
      personResponsibleName: null,
      personResponsibleAffiliation: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    expect(resolveResearcher(application)).toEqual({
      name: 'Dr. Research',
      affiliation: '',
      did: 'did:key:zfixed',
    });
  });
});

describe('resolveSpeSelection', () => {
  it('skips both lookups when there is no fee estimate', async () => {
    const result = await resolveSpeSelection(null);

    expect(speOperatorFindUnique).not.toHaveBeenCalled();
    expect(speTypeFindUnique).not.toHaveBeenCalled();
    expect(result).toEqual({
      speOperatorId: null,
      speTypeId: null,
      speOperator: null,
      speType: null,
      estimateLineItems: [],
      totalAmount: 0,
    });
  });

  it('skips both lookups when the fee estimate has no speOperatorId/speTypeId', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const feeEstimate = { speOperatorId: null, speTypeId: null, lineItems: [] } as any;

    const result = await resolveSpeSelection(feeEstimate);

    expect(speOperatorFindUnique).not.toHaveBeenCalled();
    expect(speTypeFindUnique).not.toHaveBeenCalled();
    expect(result.speOperator).toBeNull();
    expect(result.speType).toBeNull();
  });

  it('looks up and shapes the SPE operator/type when ids are present, including the nested provider name', async () => {
    speOperatorFindUnique.mockResolvedValue({
      id: 'op-1',
      name: 'RIVM SPE Operations',
      speProvider: { name: 'Acme Cloud' },
    } as never);
    speTypeFindUnique.mockResolvedValue({ id: 'type-1', name: 'Enterprise' } as never);

    const feeEstimate = {
      speOperatorId: 'op-1',
      speTypeId: 'type-1',
      lineItems: [{ amount: 100 }, { amount: 50 }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await resolveSpeSelection(feeEstimate);

    expect(speOperatorFindUnique).toHaveBeenCalledWith({
      where: { id: 'op-1' },
      include: { speProvider: { select: { name: true } } },
    });
    expect(speTypeFindUnique).toHaveBeenCalledWith({ where: { id: 'type-1' } });
    expect(result.speOperatorId).toBe('op-1');
    expect(result.speTypeId).toBe('type-1');
    expect(result.speOperator).toEqual({
      id: 'op-1',
      name: 'RIVM SPE Operations',
      providerName: 'Acme Cloud',
      type: { id: 'type-1', name: 'Enterprise' },
    });
    expect(result.speType).toEqual({ id: 'type-1', name: 'Enterprise' });
    expect(result.totalAmount).toBe(150);
  });
});

describe('POST /api/permits', () => {
  function callPost(body: unknown) {
    const req = new NextRequest('http://localhost/api/permits', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return POST(req);
  }

  const VALID_BODY = {
    applicationId: 'app-1',
    validFrom: '2026-01-01T00:00:00Z',
    validUntil: '2027-01-01T00:00:00Z',
    issuedByUserId: 'u-1',
    outputControllerName: 'Output Controller',
    outputControllerAffiliation: 'HDAB-NL',
  };

  it('rejects an acting user who is not DECISION_MAKER/ADMIN', async () => {
    userFindUnique.mockResolvedValue(APPLICANT as never);

    const res = await callPost({ ...VALID_BODY, issuedByUserId: 'u-2' });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Role APPLICANT is not permitted to perform this action' });
    expect(applicationFindUnique).not.toHaveBeenCalled();
  });

  it('rejects a missing outputControllerName/outputControllerAffiliation with a 422', async () => {
    userFindUnique.mockResolvedValue(DECISION_MAKER as never);

    const res = await callPost({ ...VALID_BODY, outputControllerName: '' });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: 'Output controller name and affiliation are required to issue a permit',
    });
    expect(applicationFindUnique).not.toHaveBeenCalled();
  });

  it('returns 404 when the application does not exist', async () => {
    userFindUnique.mockResolvedValue(DECISION_MAKER as never);
    applicationFindUnique.mockResolvedValue(null);

    const res = await callPost(VALID_BODY);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Application not found' });
  });

  it('returns 422 when the application decision outcome is not POSITIVE', async () => {
    userFindUnique.mockResolvedValue(DECISION_MAKER as never);
    applicationFindUnique.mockResolvedValue({ decisionOutcome: 'NEGATIVE', dataPermits: [] } as never);

    const res = await callPost(VALID_BODY);

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'Permit can only be issued for a positive decision' });
  });

  it('returns 409 when a permit has already been issued for this application', async () => {
    userFindUnique.mockResolvedValue(DECISION_MAKER as never);
    applicationFindUnique.mockResolvedValue({
      decisionOutcome: 'POSITIVE',
      dataPermits: [{ id: 'p-1' }],
    } as never);

    const res = await callPost(VALID_BODY);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'A permit has already been issued for this application' });
  });
});
