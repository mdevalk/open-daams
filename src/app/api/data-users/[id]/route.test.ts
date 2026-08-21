import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    authzFailureLog: { create: vi.fn() },
    contact: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    dataUser: { update: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { prisma } from '@/lib/db';
import { PATCH, buildDataUserUpdateData, describeDataUserChanges } from './route';

const findUnique = vi.mocked(prisma.user.findUnique);
const logCreate = vi.mocked(prisma.authzFailureLog.create);

const APPLICANT = { id: 'u-2', role: 'APPLICANT' as const, name: 'A. de Vries', email: 'researcher@umcu.nl' };

beforeEach(() => {
  findUnique.mockReset();
  logCreate.mockReset();
});

describe('buildDataUserUpdateData', () => {
  it('includes name when set', () => {
    expect(buildDataUserUpdateData({ name: '  Acme University  ' })).toEqual({ name: 'Acme University' });
  });

  it('returns an empty object for an empty body', () => {
    expect(buildDataUserUpdateData({})).toEqual({});
  });
});

describe('describeDataUserChanges', () => {
  it('lists all messages when every field changed', () => {
    const body = {
      name: 'Acme',
      contactEmail: 'a@b.com',
      contactPhone: '+31612345678',
    };
    expect(describeDataUserChanges(body)).toEqual(['name', 'contact email', 'contact phone']);
  });

  it('returns an empty array when no fields changed', () => {
    expect(describeDataUserChanges({})).toEqual([]);
  });
});

describe('PATCH /api/data-users/[id]', () => {
  function makeRequest(body: unknown) {
    return new NextRequest('http://localhost/api/data-users/du-1', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  it('rejects a non-ADMIN acting user with the authz failure status and error', async () => {
    findUnique.mockResolvedValue(APPLICANT as never);

    const res = await PATCH(makeRequest({ actingUserId: 'u-2', name: 'New Name' }), {
      params: Promise.resolve({ id: 'du-1' }),
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json).toEqual({ error: 'Role APPLICANT is not permitted to perform this action' });
    expect(prisma.dataUser.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown acting user with a 401', async () => {
    findUnique.mockResolvedValue(null);

    const res = await PATCH(makeRequest({ actingUserId: 'ghost', name: 'New Name' }), {
      params: Promise.resolve({ id: 'du-1' }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ error: 'Acting user not found' });
    expect(prisma.dataUser.update).not.toHaveBeenCalled();
  });
});
