import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    application: { findUnique: vi.fn() },
    completenessCheck: { upsert: vi.fn() },
    applicationLog: { create: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));
vi.mock('@/auth', () => ({ actingUserId: vi.fn() }));
vi.mock('@/lib/authz', () => ({ requireRole: vi.fn() }));

import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { handleChecklistUpdate } from '@/lib/checklist';

const applicationFindUnique = vi.mocked(prisma.application.findUnique);
const checkUpsert = vi.mocked(prisma.completenessCheck.upsert);
const mockRequireRole = vi.mocked(requireRole);

const OPTIONS = { delegate: prisma.completenessCheck, auditLabel: 'Volledigheidscontrole', kind: 'completeness check' };

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/applications/app-1/completeness-check', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  applicationFindUnique.mockReset();
  checkUpsert.mockReset();
  mockRequireRole.mockReset();
  mockRequireRole.mockResolvedValue({ ok: true, user: { id: 'u1', role: 'ADMIN', name: 'A', email: 'a@b.c' } });
  applicationFindUnique.mockResolvedValue({ id: 'app-1', status: 'PRE_SCREENING' } as never);
});

describe('handleChecklistUpdate', () => {
  it('returns the authz error, unmodified, when not permitted', async () => {
    mockRequireRole.mockResolvedValue({ ok: false, status: 403, error: 'not allowed' });
    const res = await handleChecklistUpdate(makeRequest({ items: [] }), 'app-1', OPTIONS);
    expect(res.status).toBe(403);
    expect(checkUpsert).not.toHaveBeenCalled();
  });

  it('returns 404 when the application does not exist', async () => {
    applicationFindUnique.mockResolvedValue(null);
    const res = await handleChecklistUpdate(makeRequest({ items: [] }), 'app-1', OPTIONS);
    expect(res.status).toBe(404);
  });

  it('rejects a body whose items is not an array', async () => {
    const res = await handleChecklistUpdate(makeRequest({ items: 'nope' }), 'app-1', OPTIONS);
    expect(res.status).toBe(422);
    expect(checkUpsert).not.toHaveBeenCalled();
  });

  it('upserts the check without an audit log entry while PENDING', async () => {
    checkUpsert.mockResolvedValue({ id: 'c1', result: 'PENDING' } as never);
    const res = await handleChecklistUpdate(
      makeRequest({ items: [{ key: 'a', label: 'A', passed: true }], result: 'PENDING' }),
      'app-1',
      OPTIONS,
    );
    expect(res.status).toBe(201);
    expect(checkUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { applicationId: 'app-1' },
        create: expect.objectContaining({ applicationId: 'app-1', result: 'PENDING', checkedAt: null }),
      }),
    );
    expect(prisma.applicationLog.create).not.toHaveBeenCalled();
  });

  it('writes an immutable audit log entry when the result is a decision (COMPLETE/INCOMPLETE)', async () => {
    checkUpsert.mockResolvedValue({ id: 'c1', result: 'COMPLETE' } as never);
    const res = await handleChecklistUpdate(
      makeRequest({
        items: [
          { key: 'a', label: 'Item A', passed: true },
          { key: 'b', label: 'Item B', passed: false },
        ],
        result: 'COMPLETE',
        remarks: 'Looks fine',
      }),
      'app-1',
      OPTIONS,
    );
    expect(res.status).toBe(201);
    expect(prisma.applicationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        applicationId: 'app-1',
        userId: 'u1',
        action: 'Volledigheidscontrole: volledig',
        comment: 'Volledigheidscontrole (1/2 afgevinkt). Niet afgevinkt: Item B. Opmerking: Looks fine',
      }),
    });
  });

  it('reports a friendly error and 500 status if the save throws', async () => {
    checkUpsert.mockRejectedValue(new Error('db exploded'));
    const res = await handleChecklistUpdate(makeRequest({ items: [] }), 'app-1', OPTIONS);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'db exploded' });
  });
});
