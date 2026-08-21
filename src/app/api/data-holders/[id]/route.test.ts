import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    authzFailureLog: { create: vi.fn() },
    contact: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    dataHolder: { update: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { prisma } from '@/lib/db';
import { PATCH, buildDataHolderUpdateData, describeDataHolderChanges } from './route';

const findUnique = vi.mocked(prisma.user.findUnique);
const logCreate = vi.mocked(prisma.authzFailureLog.create);

const APPLICANT = { id: 'u-2', role: 'APPLICANT' as const, name: 'A. de Vries', email: 'researcher@umcu.nl' };

beforeEach(() => {
  findUnique.mockReset();
  logCreate.mockReset();
});

describe('buildDataHolderUpdateData', () => {
  it('produces the full data object when all fields are set', () => {
    const body = {
      name: '  Acme Hospital  ',
      isTrusted: true,
      address: '1 Main St',
      businessId: 'biz-1',
      vatNumber: 'NL123',
      invoiceType: 'EMAIL',
      invoiceReferenceNumber: 'REF-1',
      eInvoiceAddress: 'peppol:acme',
      operatorId: 'op-1',
      peppolCode: '0106:123',
    };
    expect(buildDataHolderUpdateData(body)).toEqual({
      name: 'Acme Hospital',
      isTrusted: true,
      address: '1 Main St',
      businessId: 'biz-1',
      vatNumber: 'NL123',
      invoiceType: 'EMAIL',
      invoiceReferenceNumber: 'REF-1',
      eInvoiceAddress: 'peppol:acme',
      operatorId: 'op-1',
      peppolCode: '0106:123',
    });
  });

  it('coerces a falsy isTrusted to a boolean rather than dropping it', () => {
    expect(buildDataHolderUpdateData({ isTrusted: 0 })).toEqual({ isTrusted: false });
    expect(buildDataHolderUpdateData({ isTrusted: 'yes' })).toEqual({ isTrusted: true });
  });

  it('includes only the field present when only name is set', () => {
    expect(buildDataHolderUpdateData({ name: 'Acme' })).toEqual({ name: 'Acme' });
  });

  it('returns an empty object for an empty body', () => {
    expect(buildDataHolderUpdateData({})).toEqual({});
  });
});

describe('describeDataHolderChanges', () => {
  it('lists all messages when every field changed, including both isTrusted phrasings', () => {
    const bodyTrusted = {
      name: 'Acme',
      contactEmail: 'a@b.com',
      contactPhone: '+31612345678',
      isTrusted: true,
      address: '1 Main St',
      businessId: 'biz-1',
      vatNumber: 'NL123',
      invoiceType: 'EMAIL',
      invoiceReferenceNumber: 'REF-1',
      eInvoiceAddress: 'peppol:acme',
      operatorId: 'op-1',
      peppolCode: '0106:123',
    };
    expect(describeDataHolderChanges(bodyTrusted)).toEqual([
      'name',
      'contact email',
      'contact phone',
      'marked as trusted',
      'address',
      'business ID',
      'VAT number',
      'invoice type',
      'invoice reference number',
      'e-invoice address',
      'operator ID',
      'Peppol code',
    ]);

    expect(describeDataHolderChanges({ ...bodyTrusted, isTrusted: false })).toContain('un-marked as trusted');
  });

  it('returns an empty array when no fields changed', () => {
    expect(describeDataHolderChanges({})).toEqual([]);
  });
});

describe('PATCH /api/data-holders/[id]', () => {
  function makeRequest(body: unknown) {
    return new NextRequest('http://localhost/api/data-holders/dh-1', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  it('rejects a non-ADMIN acting user with the authz failure status and error', async () => {
    findUnique.mockResolvedValue(APPLICANT as never);

    const res = await PATCH(makeRequest({ actingUserId: 'u-2', name: 'New Name' }), {
      params: Promise.resolve({ id: 'dh-1' }),
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json).toEqual({ error: 'Role APPLICANT is not permitted to perform this action' });
    expect(prisma.dataHolder.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown acting user with a 401', async () => {
    findUnique.mockResolvedValue(null);

    const res = await PATCH(makeRequest({ actingUserId: 'ghost', name: 'New Name' }), {
      params: Promise.resolve({ id: 'dh-1' }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ error: 'Acting user not found' });
    expect(prisma.dataHolder.update).not.toHaveBeenCalled();
  });
});
