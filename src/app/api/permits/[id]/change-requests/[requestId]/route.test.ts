import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    authzFailureLog: { create: vi.fn() },
    permitChangeRequest: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from '@/lib/db';
import { PATCH, resolveOutputController, resolveEffectiveDate } from './route';

const findUnique = vi.mocked(prisma.user.findUnique);
const changeRequestFindUnique = vi.mocked(prisma.permitChangeRequest.findUnique);
const authzFailureLogCreate = vi.mocked(prisma.authzFailureLog.create);

const DECISION_MAKER = { id: 'u-1', role: 'DECISION_MAKER' as const, name: 'D. Maker', email: 'dm@hdab.nl' };
const APPLICANT = { id: 'u-2', role: 'APPLICANT' as const, name: 'A. de Vries', email: 'researcher@umcu.nl' };

beforeEach(() => {
  findUnique.mockReset();
  changeRequestFindUnique.mockReset();
  authzFailureLogCreate.mockReset();
});

describe('resolveOutputController', () => {
  const existingOutputController = {
    role: 'OUTPUT_CONTROLLER',
    did: 'did:key:zexisting',
    name: 'Existing OC',
    affiliation: 'HDAB-NL',
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function permitWith(authorizedPersons: unknown[]): any {
    return { authorizedPersons };
  }

  it('AMENDMENT with both name and affiliation provided generates a fresh identity', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const request = { type: 'AMENDMENT' } as any;
    const permit = permitWith([existingOutputController]);

    const result = resolveOutputController(request, permit, {
      outputControllerName: 'New Controller',
      outputControllerAffiliation: 'New Org',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok: true');
    expect(result.outputController.name).toBe('New Controller');
    expect(result.outputController.affiliation).toBe('New Org');
    expect(result.outputController.did).toMatch(/^did:key:z/);
    expect(result.outputController.did).not.toBe(existingOutputController.did);
  });

  it('AMENDMENT with only one of name/affiliation provided fails validation with a 422', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const request = { type: 'AMENDMENT' } as any;
    const permit = permitWith([existingOutputController]);
    const expectedError = {
      ok: false,
      status: 422,
      error: 'Both outputControllerName and outputControllerAffiliation are required to change the output controller',
    };

    expect(resolveOutputController(request, permit, { outputControllerName: 'New Controller' })).toEqual(
      expectedError,
    );
    expect(resolveOutputController(request, permit, { outputControllerAffiliation: 'New Org' })).toEqual(
      expectedError,
    );
  });

  it('carries the existing output controller forward unchanged for non-AMENDMENT types, ignoring body fields', () => {
    const permit = permitWith([existingOutputController]);
    const body = { outputControllerName: 'Should be ignored', outputControllerAffiliation: 'Should be ignored' };

    for (const type of ['RENEWAL', 'REVOCATION_APPEAL']) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const request = { type } as any;
      expect(resolveOutputController(request, permit, body)).toEqual({
        ok: true,
        outputController: { name: 'Existing OC', affiliation: 'HDAB-NL', did: 'did:key:zexisting' },
      });
    }
  });

  it('fails with a 500 when the permit has no output controller row at all', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const request = { type: 'AMENDMENT' } as any;
    const permit = permitWith([]);

    expect(resolveOutputController(request, permit, {})).toEqual({
      ok: false,
      status: 500,
      error: 'Permit has no output controller to carry forward',
    });
  });

  it('fails with a 500 when the existing output controller row has no did', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const request = { type: 'AMENDMENT' } as any;
    const permit = permitWith([{ role: 'OUTPUT_CONTROLLER', did: null, name: 'X', affiliation: 'Y' }]);

    expect(resolveOutputController(request, permit, {})).toEqual({
      ok: false,
      status: 500,
      error: 'Permit has no output controller to carry forward',
    });
  });
});

describe('resolveEffectiveDate', () => {
  it('AMENDMENT with a future effectiveDate defers', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const future = new Date('2026-02-01T00:00:00Z');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const request = { type: 'AMENDMENT' } as any;

    const result = resolveEffectiveDate(request, { effectiveDate: future.toISOString() }, now);

    expect(result).toEqual({ requestedEffectiveDate: future, deferred: true });
  });

  it('AMENDMENT with a past effectiveDate does not defer', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const past = new Date('2025-01-01T00:00:00Z');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const request = { type: 'AMENDMENT' } as any;

    const result = resolveEffectiveDate(request, { effectiveDate: past.toISOString() }, now);

    expect(result).toEqual({ requestedEffectiveDate: past, deferred: false });
  });

  it('AMENDMENT with no effectiveDate does not defer and has a null requestedEffectiveDate', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const request = { type: 'AMENDMENT' } as any;

    expect(resolveEffectiveDate(request, {}, now)).toEqual({ requestedEffectiveDate: null, deferred: false });
  });

  it('non-AMENDMENT types never defer, even with a future effectiveDate in the body', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const future = new Date('2026-02-01T00:00:00Z');

    for (const type of ['RENEWAL', 'REVOCATION_APPEAL']) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const request = { type } as any;
      const result = resolveEffectiveDate(request, { effectiveDate: future.toISOString() }, now);
      expect(result).toEqual({ requestedEffectiveDate: null, deferred: false });
    }
  });
});

describe('PATCH /api/permits/[id]/change-requests/[requestId]', () => {
  function callPatch(body: unknown) {
    const req = new NextRequest('http://localhost/api/permits/p-1/change-requests/cr-1', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return PATCH(req, { params: Promise.resolve({ id: 'p-1', requestId: 'cr-1' }) });
  }

  it('rejects an invalid decision value with a 400', async () => {
    const res = await callPatch({ decision: 'MAYBE', actingUserId: 'u-1' });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'decision must be APPROVED or REJECTED' });
    expect(prisma.permitChangeRequest.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a non-decision-maker acting user with the authz failure status and error', async () => {
    findUnique.mockResolvedValue(APPLICANT as never);

    const res = await callPatch({ decision: 'APPROVED', actingUserId: 'u-2' });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Role APPLICANT is not permitted to perform this action' });
    expect(prisma.permitChangeRequest.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an unknown acting user with a 401', async () => {
    findUnique.mockResolvedValue(null);

    const res = await callPatch({ decision: 'APPROVED', actingUserId: 'ghost' });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Acting user not found' });
  });

  it('returns 404 when the change request does not exist', async () => {
    findUnique.mockResolvedValue(DECISION_MAKER as never);
    changeRequestFindUnique.mockResolvedValue(null);

    const res = await callPatch({ decision: 'APPROVED', actingUserId: 'u-1' });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Change request not found' });
  });

  it('returns 404 when the change request belongs to a different permit', async () => {
    findUnique.mockResolvedValue(DECISION_MAKER as never);
    changeRequestFindUnique.mockResolvedValue({ id: 'cr-1', permitId: 'other-permit', status: 'REQUESTED' } as never);

    const res = await callPatch({ decision: 'APPROVED', actingUserId: 'u-1' });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Change request not found' });
  });

  it('returns 422 when the request has already been decided', async () => {
    findUnique.mockResolvedValue(DECISION_MAKER as never);
    changeRequestFindUnique.mockResolvedValue({ id: 'cr-1', permitId: 'p-1', status: 'APPROVED' } as never);

    const res = await callPatch({ decision: 'APPROVED', actingUserId: 'u-1' });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'This request has already been decided' });
  });

  it('returns 422 when the permit version has been superseded', async () => {
    findUnique.mockResolvedValue(DECISION_MAKER as never);
    changeRequestFindUnique.mockResolvedValue({
      id: 'cr-1',
      permitId: 'p-1',
      status: 'REQUESTED',
      type: 'AMENDMENT',
      permit: { isCurrent: false },
    } as never);

    const res = await callPatch({ decision: 'APPROVED', actingUserId: 'u-1' });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'This permit version has been superseded' });
  });

  it('returns 422 for a RENEWAL approval without newValidUntil', async () => {
    findUnique.mockResolvedValue(DECISION_MAKER as never);
    changeRequestFindUnique.mockResolvedValue({
      id: 'cr-1',
      permitId: 'p-1',
      status: 'REQUESTED',
      type: 'RENEWAL',
      permit: { isCurrent: true },
    } as never);

    const res = await callPatch({ decision: 'APPROVED', actingUserId: 'u-1' });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'A new validUntil date is required to approve a renewal' });
  });
});
