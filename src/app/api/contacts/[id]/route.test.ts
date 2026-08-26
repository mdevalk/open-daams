import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    authzFailureLog: { create: vi.fn() },
    contact: { update: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { prisma } from '@/lib/db';
import { PATCH, DELETE, buildContactUpdateData } from './route';

const userFindUnique = vi.mocked(prisma.user.findUnique);
const contactUpdate = vi.mocked(prisma.contact.update);
const contactFindUnique = vi.mocked(prisma.contact.findUnique);
const contactDelete = vi.mocked(prisma.contact.delete);
const auditLogCreate = vi.mocked(prisma.auditLog.create);

const ADMIN = { id: 'u-1', role: 'ADMIN' as const, name: 'Admin', email: 'admin@hdab.nl' };
const APPLICANT = { id: 'u-2', role: 'APPLICANT' as const, name: 'A. de Vries', email: 'researcher@umcu.nl' };

beforeEach(() => {
  userFindUnique.mockReset();
  contactUpdate.mockReset();
  contactFindUnique.mockReset();
  contactDelete.mockReset();
  auditLogCreate.mockReset();
});

describe('buildContactUpdateData', () => {
  it('includes only the fields present in the body', () => {
    expect(buildContactUpdateData({ name: 'Jane' })).toEqual({ name: 'Jane' });
    expect(buildContactUpdateData({})).toEqual({});
  });

  it('nulls out a field explicitly cleared with an empty string', () => {
    expect(buildContactUpdateData({ email: '' })).toEqual({ email: null });
  });

  it('produces the full data object when every field is set', () => {
    expect(buildContactUpdateData({ name: 'Jane', email: 'j@x.com', phone: '0612345678', role: 'PRIMARY' })).toEqual({
      name: 'Jane',
      email: 'j@x.com',
      phone: '0612345678',
      role: 'PRIMARY',
    });
  });

  it('sets the FK for the given ownerType and nulls the other three when reassigning', () => {
    expect(buildContactUpdateData({ ownerType: 'SpeOperator', ownerId: 'so-1' })).toEqual({
      dataUserId: null,
      dataHolderId: null,
      speOperatorId: 'so-1',
      speProviderId: null,
    });
  });

  it('rejects an ownerType that only resolves via the Object prototype chain, without nulling out every owner FK', () => {
    // OWNER_FIELD is a plain object literal — bracket access on 'constructor'/'toString'/etc.
    // resolves inherited Object.prototype members, not a real owner field. Confirms the
    // Object.hasOwn() guard rejects these instead of treating them as a valid reassignment.
    expect(buildContactUpdateData({ ownerType: 'constructor', ownerId: 'x' })).toEqual({});
    expect(buildContactUpdateData({ ownerType: 'toString', ownerId: 'x' })).toEqual({});
    expect(buildContactUpdateData({ ownerType: 'hasOwnProperty', ownerId: 'x' })).toEqual({});
  });

  it('leaves the owner untouched when ownerType/ownerId are absent', () => {
    expect(buildContactUpdateData({ name: 'Jane' })).toEqual({ name: 'Jane' });
  });

  it('leaves the owner untouched when ownerId is missing even if ownerType is set', () => {
    expect(buildContactUpdateData({ ownerType: 'DataHolder' })).toEqual({});
  });
});

describe('PATCH /api/contacts/[id]', () => {
  function makeRequest(body: unknown) {
    return new NextRequest('http://localhost/api/contacts/c-1', { method: 'PATCH', body: JSON.stringify(body) });
  }

  it('rejects a non-ADMIN acting user', async () => {
    userFindUnique.mockResolvedValue(APPLICANT as never);

    const res = await PATCH(makeRequest({ actingUserId: 'u-2', name: 'New Name' }), { params: Promise.resolve({ id: 'c-1' }) });

    expect(res.status).toBe(403);
    expect(contactUpdate).not.toHaveBeenCalled();
  });

  it('updates the contact and logs it', async () => {
    userFindUnique.mockResolvedValue(ADMIN as never);
    contactUpdate.mockResolvedValue({
      id: 'c-1',
      name: 'New Name',
      email: null,
      dataUser: null,
      dataHolder: { name: 'Acme' },
      speOperator: null,
      speProvider: null,
    } as never);

    const res = await PATCH(makeRequest({ actingUserId: 'u-1', name: 'New Name' }), { params: Promise.resolve({ id: 'c-1' }) });

    expect(res.status).toBe(200);
    expect(contactUpdate).toHaveBeenCalledWith({ where: { id: 'c-1' }, data: { name: 'New Name' }, include: expect.anything() });
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ entityType: 'Contact', entityId: 'c-1' }) }),
    );
  });

  it('reassigns the contact to a new owner', async () => {
    userFindUnique.mockResolvedValue(ADMIN as never);
    contactUpdate.mockResolvedValue({
      id: 'c-1',
      name: 'Jane Doe',
      email: null,
      dataUser: null,
      dataHolder: null,
      speOperator: { name: 'RIVM SPE Operations' },
      speProvider: null,
    } as never);

    const res = await PATCH(makeRequest({ actingUserId: 'u-1', ownerType: 'SpeOperator', ownerId: 'so-1' }), {
      params: Promise.resolve({ id: 'c-1' }),
    });

    expect(res.status).toBe(200);
    expect(contactUpdate).toHaveBeenCalledWith({
      where: { id: 'c-1' },
      data: { dataUserId: null, dataHolderId: null, speOperatorId: 'so-1', speProviderId: null },
      include: expect.anything(),
    });
  });
});

describe('DELETE /api/contacts/[id]', () => {
  function makeRequest(body: unknown) {
    return new NextRequest('http://localhost/api/contacts/c-1', { method: 'DELETE', body: JSON.stringify(body) });
  }

  it('rejects a non-ADMIN acting user', async () => {
    userFindUnique.mockResolvedValue(APPLICANT as never);

    const res = await DELETE(makeRequest({ actingUserId: 'u-2' }), { params: Promise.resolve({ id: 'c-1' }) });

    expect(res.status).toBe(403);
    expect(contactDelete).not.toHaveBeenCalled();
  });

  it('returns 404 when the contact does not exist', async () => {
    userFindUnique.mockResolvedValue(ADMIN as never);
    contactFindUnique.mockResolvedValue(null);

    const res = await DELETE(makeRequest({ actingUserId: 'u-1' }), { params: Promise.resolve({ id: 'c-1' }) });

    expect(res.status).toBe(404);
    expect(contactDelete).not.toHaveBeenCalled();
  });

  it('deletes the contact and logs it', async () => {
    userFindUnique.mockResolvedValue(ADMIN as never);
    contactFindUnique.mockResolvedValue({ id: 'c-1', name: 'Jane Doe', email: null } as never);

    const res = await DELETE(makeRequest({ actingUserId: 'u-1' }), { params: Promise.resolve({ id: 'c-1' }) });

    expect(res.status).toBe(200);
    expect(contactDelete).toHaveBeenCalledWith({ where: { id: 'c-1' } });
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ entityType: 'Contact', entityId: 'c-1' }) }),
    );
  });
});
