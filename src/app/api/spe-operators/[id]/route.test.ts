import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    authzFailureLog: { create: vi.fn() },
    contact: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    speOperator: { update: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { prisma } from '@/lib/db';
import { PATCH, buildSpeOperatorUpdateData, describeSpeOperatorChanges } from './route';

const findUnique = vi.mocked(prisma.user.findUnique);
const logCreate = vi.mocked(prisma.authzFailureLog.create);

const APPLICANT = { id: 'u-2', role: 'APPLICANT' as const, name: 'A. de Vries', email: 'researcher@umcu.nl' };

beforeEach(() => {
  findUnique.mockReset();
  logCreate.mockReset();
});

describe('buildSpeOperatorUpdateData', () => {
  it('produces the full data object when all fields are set', () => {
    const body = {
      name: '  Acme SPE  ',
      speProviderId: 'sp-1',
      address: '1 Main St',
      businessId: 'biz-1',
      vatNumber: 'NL123',
      invoiceType: 'EMAIL',
      invoiceReferenceNumber: 'REF-1',
      eInvoiceAddress: 'peppol:acme',
      operatorId: 'op-1',
      peppolCode: '0106:123',
    };
    expect(buildSpeOperatorUpdateData(body)).toEqual({
      name: 'Acme SPE',
      speProviderId: 'sp-1',
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

  it('includes only the field present when only name is set', () => {
    expect(buildSpeOperatorUpdateData({ name: 'Acme' })).toEqual({ name: 'Acme' });
  });

  it('returns an empty object for an empty body', () => {
    expect(buildSpeOperatorUpdateData({})).toEqual({});
  });
});

describe('describeSpeOperatorChanges', () => {
  const baseSpeOperator = { name: 'Acme SPE', speProvider: null as { name: string } | null };

  it('lists all messages when every field changed', () => {
    const body = {
      name: 'Acme',
      contactEmail: 'a@b.com',
      contactPhone: '+31612345678',
      speProviderId: 'sp-1',
      address: '1 Main St',
      businessId: 'biz-1',
      vatNumber: 'NL123',
      invoiceType: 'EMAIL',
      invoiceReferenceNumber: 'REF-1',
      eInvoiceAddress: 'peppol:acme',
      operatorId: 'op-1',
      peppolCode: '0106:123',
    };
    expect(describeSpeOperatorChanges(body, { ...baseSpeOperator, speProvider: { name: 'Provider Co' } })).toEqual([
      'name',
      'contact email',
      'contact phone',
      'SPE provider set to Provider Co',
      'address',
      'business ID',
      'VAT number',
      'invoice type',
      'invoice reference number',
      'e-invoice address',
      'operator ID',
      'Peppol code',
    ]);
  });

  it('reports the resolved provider name when speProviderId changed and a provider is set', () => {
    const changes = describeSpeOperatorChanges({ speProviderId: 'sp-1' }, { ...baseSpeOperator, speProvider: { name: 'Provider Co' } });
    expect(changes).toEqual(['SPE provider set to Provider Co']);
  });

  it('reports the provider as cleared when speProviderId changed and speOperator.speProvider is null', () => {
    const changes = describeSpeOperatorChanges({ speProviderId: null }, { ...baseSpeOperator, speProvider: null });
    expect(changes).toEqual(['SPE provider cleared']);
  });

  it('returns an empty array when no fields changed', () => {
    expect(describeSpeOperatorChanges({}, baseSpeOperator)).toEqual([]);
  });
});

describe('PATCH /api/spe-operators/[id]', () => {
  function makeRequest(body: unknown) {
    return new NextRequest('http://localhost/api/spe-operators/op-1', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  it('rejects a non-ADMIN acting user with the authz failure status and error', async () => {
    findUnique.mockResolvedValue(APPLICANT as never);

    const res = await PATCH(makeRequest({ actingUserId: 'u-2', name: 'New Name' }), {
      params: Promise.resolve({ id: 'op-1' }),
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json).toEqual({ error: 'Role APPLICANT is not permitted to perform this action' });
    expect(prisma.speOperator.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown acting user with a 401', async () => {
    findUnique.mockResolvedValue(null);

    const res = await PATCH(makeRequest({ actingUserId: 'ghost', name: 'New Name' }), {
      params: Promise.resolve({ id: 'op-1' }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ error: 'Acting user not found' });
    expect(prisma.speOperator.update).not.toHaveBeenCalled();
  });
});
