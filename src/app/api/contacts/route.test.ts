import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    authzFailureLog: { create: vi.fn() },
    contact: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('@/auth', () => ({
  actingUserId: vi.fn().mockResolvedValue('mock-acting-user-id'),
}));

import { prisma } from '@/lib/db';
import { POST } from './route';

const userFindUnique = vi.mocked(prisma.user.findUnique);
const contactCreate = vi.mocked(prisma.contact.create);
const auditLogCreate = vi.mocked(prisma.auditLog.create);

const ADMIN = { id: 'u-1', role: 'ADMIN' as const, name: 'Admin', email: 'admin@hdab.nl' };
const APPLICANT = { id: 'u-2', role: 'APPLICANT' as const, name: 'A. de Vries', email: 'researcher@umcu.nl' };

beforeEach(() => {
  userFindUnique.mockReset();
  contactCreate.mockReset();
  auditLogCreate.mockReset();
});

describe('POST /api/contacts', () => {
  function makeRequest(body: unknown) {
    return new NextRequest('http://localhost/api/contacts', { method: 'POST', body: JSON.stringify(body) });
  }

  it('rejects a non-ADMIN acting user', async () => {
    userFindUnique.mockResolvedValue(APPLICANT as never);

    const res = await POST(makeRequest({ actingUserId: 'u-2', ownerType: 'DataHolder', ownerId: 'dh-1', name: 'Jane' }));

    expect(res.status).toBe(403);
    expect(contactCreate).not.toHaveBeenCalled();
  });

  it('rejects a missing ownerType/ownerId with a 422', async () => {
    userFindUnique.mockResolvedValue(ADMIN as never);

    const res = await POST(makeRequest({ actingUserId: 'u-1', name: 'Jane' }));

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'ownerType and ownerId are required' });
    expect(contactCreate).not.toHaveBeenCalled();
  });

  it('rejects an ownerType that only resolves via the Object prototype chain', async () => {
    // OWNER_FIELD is a plain object literal — 'constructor'/'toString'/etc. resolve to
    // inherited Object.prototype members, not a real owner field.
    userFindUnique.mockResolvedValue(ADMIN as never);

    const res = await POST(makeRequest({ actingUserId: 'u-1', ownerType: 'constructor', ownerId: 'x', name: 'Jane' }));

    expect(res.status).toBe(422);
    expect(contactCreate).not.toHaveBeenCalled();
  });

  it('rejects a body with neither name nor email', async () => {
    userFindUnique.mockResolvedValue(ADMIN as never);

    const res = await POST(makeRequest({ actingUserId: 'u-1', ownerType: 'DataHolder', ownerId: 'dh-1', phone: '0612345678' }));

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'At least a name or email is required' });
    expect(contactCreate).not.toHaveBeenCalled();
  });

  it('creates a contact scoped to the given owner field and logs it', async () => {
    userFindUnique.mockResolvedValue(ADMIN as never);
    contactCreate.mockResolvedValue({
      id: 'c-1',
      name: 'Jane Doe',
      email: null,
      dataUser: null,
      dataHolder: null,
      speOperator: null,
      speProvider: null,
    } as never);

    const res = await POST(
      makeRequest({ actingUserId: 'u-1', ownerType: 'SpeOperator', ownerId: 'so-1', name: 'Jane Doe', role: 'PRIMARY' }),
    );

    expect(res.status).toBe(201);
    expect(contactCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ speOperatorId: 'so-1', name: 'Jane Doe', role: 'PRIMARY' }),
      }),
    );
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entityType: 'Contact', entityId: 'c-1' }),
      }),
    );
  });
});
