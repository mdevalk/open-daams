import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    authzFailureLog: { create: vi.fn() },
    speType: { update: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { prisma } from '@/lib/db';
import { PATCH, validateSpeTypeFees, buildSpeTypeUpdateData, describeSpeTypeChanges } from './route';

const findUnique = vi.mocked(prisma.user.findUnique);
const logCreate = vi.mocked(prisma.authzFailureLog.create);

const APPLICANT = { id: 'u-2', role: 'APPLICANT' as const, name: 'A. de Vries', email: 'researcher@umcu.nl' };

beforeEach(() => {
  findUnique.mockReset();
  logCreate.mockReset();
});

describe('validateSpeTypeFees', () => {
  it('returns null when both fees are valid numbers', () => {
    expect(validateSpeTypeFees({ setupFee: 100, monthlyFee: 25 })).toBeNull();
  });

  it('returns an error when setupFee is not a number', () => {
    expect(validateSpeTypeFees({ setupFee: 'abc' })).toBe('setupFee must be a number');
  });

  it('returns an error when monthlyFee is not a number', () => {
    expect(validateSpeTypeFees({ monthlyFee: 'abc' })).toBe('monthlyFee must be a number');
  });

  it('returns null when both fees are absent', () => {
    expect(validateSpeTypeFees({})).toBeNull();
  });
});

describe('buildSpeTypeUpdateData', () => {
  it('produces the full data object when all fields are set', () => {
    const body = { name: '  Standard  ', setupFee: 100, monthlyFee: 25 };
    expect(buildSpeTypeUpdateData(body)).toEqual({
      name: 'Standard',
      setupFee: 100,
      monthlyFee: 25,
    });
  });

  it('returns an empty object for an empty body', () => {
    expect(buildSpeTypeUpdateData({})).toEqual({});
  });
});

describe('describeSpeTypeChanges', () => {
  it('lists all messages when every field changed', () => {
    expect(describeSpeTypeChanges({ name: 'Standard', setupFee: 100, monthlyFee: 25 })).toEqual([
      'name',
      'setup fee',
      'monthly fee',
    ]);
  });

  it('returns an empty array when no fields changed', () => {
    expect(describeSpeTypeChanges({})).toEqual([]);
  });
});

describe('PATCH /api/spe-types/[id]', () => {
  function makeRequest(body: unknown) {
    return new NextRequest('http://localhost/api/spe-types/st-1', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  it('rejects a non-ADMIN acting user with the authz failure status and error', async () => {
    findUnique.mockResolvedValue(APPLICANT as never);

    const res = await PATCH(makeRequest({ actingUserId: 'u-2', name: 'New Name' }), {
      params: Promise.resolve({ id: 'st-1' }),
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json).toEqual({ error: 'Role APPLICANT is not permitted to perform this action' });
    expect(prisma.speType.update).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric setupFee with a 422', async () => {
    findUnique.mockResolvedValue({ id: 'u-1', role: 'ADMIN', name: 'Admin', email: 'admin@hdab.nl' } as never);

    const res = await PATCH(makeRequest({ actingUserId: 'u-1', setupFee: 'abc' }), {
      params: Promise.resolve({ id: 'st-1' }),
    });

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json).toEqual({ error: 'setupFee must be a number' });
    expect(prisma.speType.update).not.toHaveBeenCalled();
  });
});
