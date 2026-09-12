import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    application: { findUnique: vi.fn() },
    completenessCheck: { upsert: vi.fn() },
    assessmentCheck: { upsert: vi.fn() },
    applicationLog: { create: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));
vi.mock('@/auth', () => ({ actingUserId: vi.fn() }));
vi.mock('@/lib/authz', () => ({ requireRole: vi.fn() }));

import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { completePreScreeningCheck, completeSubstantiveAssessment } from '@/lib/capabilities/application-lifecycle/checklist-checks';

const applicationFindUnique = vi.mocked(prisma.application.findUnique);
const completenessUpsert = vi.mocked(prisma.completenessCheck.upsert);
const assessmentUpsert = vi.mocked(prisma.assessmentCheck.upsert);
const mockRequireRole = vi.mocked(requireRole);

beforeEach(() => {
  applicationFindUnique.mockReset();
  completenessUpsert.mockReset();
  assessmentUpsert.mockReset();
  mockRequireRole.mockReset();
  mockRequireRole.mockResolvedValue({ ok: true, user: { id: 'u1', role: 'ADMIN', name: 'A', email: 'a@b.c' } });
  applicationFindUnique.mockResolvedValue({ id: 'app-1', status: 'PRE_SCREENING' } as never);
});

describe('completePreScreeningCheck', () => {
  it('returns the authz error, unmodified, when not permitted', async () => {
    mockRequireRole.mockResolvedValue({ ok: false, status: 403, error: 'not allowed' });
    const result = await completePreScreeningCheck('u1', 'app-1', { items: [] });
    expect(result).toEqual({ ok: false, status: 403, error: 'not allowed' });
    expect(completenessUpsert).not.toHaveBeenCalled();
  });

  it('returns 404 when the application does not exist', async () => {
    applicationFindUnique.mockResolvedValue(null);
    const result = await completePreScreeningCheck('u1', 'app-1', { items: [] });
    expect(result).toEqual({ ok: false, status: 404, error: 'Not found' });
  });

  it('rejects a body whose items is not an array', async () => {
    const result = await completePreScreeningCheck('u1', 'app-1', { items: 'nope' });
    expect(result).toEqual({ ok: false, status: 422, error: 'items must be an array' });
    expect(completenessUpsert).not.toHaveBeenCalled();
  });

  it('upserts the check without an audit log entry while PENDING', async () => {
    completenessUpsert.mockResolvedValue({ id: 'c1', result: 'PENDING' } as never);
    const result = await completePreScreeningCheck('u1', 'app-1', {
      items: [{ key: 'a', label: 'A', passed: true }],
      result: 'PENDING',
    });
    expect(result).toEqual({ ok: true, status: 201, data: { id: 'c1', result: 'PENDING' } });
    expect(completenessUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { applicationId: 'app-1' },
        create: expect.objectContaining({ applicationId: 'app-1', result: 'PENDING', checkedAt: null }),
      }),
    );
    expect(prisma.applicationLog.create).not.toHaveBeenCalled();
  });

  it('writes an immutable audit log entry when the result is a decision (COMPLETE/INCOMPLETE)', async () => {
    completenessUpsert.mockResolvedValue({ id: 'c1', result: 'COMPLETE' } as never);
    const result = await completePreScreeningCheck('u1', 'app-1', {
      items: [
        { key: 'a', label: 'Item A', passed: true },
        { key: 'b', label: 'Item B', passed: false },
      ],
      result: 'COMPLETE',
      remarks: 'Looks fine',
    });
    expect(result.ok).toBe(true);
    expect(prisma.applicationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        applicationId: 'app-1',
        userId: 'u1',
        action: 'Volledigheidscontrole: volledig',
        comment: 'Volledigheidscontrole (1/2 afgevinkt). Niet afgevinkt: Item B. Opmerking: Looks fine',
      }),
    });
  });

  it('reports a friendly error when the save throws', async () => {
    completenessUpsert.mockRejectedValue(new Error('db exploded'));
    const result = await completePreScreeningCheck('u1', 'app-1', { items: [] });
    expect(result).toEqual({ ok: false, status: 500, error: 'db exploded' });
  });
});

describe('completeSubstantiveAssessment', () => {
  it('upserts against the assessment-check delegate with its own audit label', async () => {
    assessmentUpsert.mockResolvedValue({ id: 'a1', result: 'COMPLETE' } as never);
    const result = await completeSubstantiveAssessment('u1', 'app-1', {
      items: [{ key: 'a', label: 'Item A', passed: true }],
      result: 'COMPLETE',
    });
    expect(result).toEqual({ ok: true, status: 201, data: { id: 'a1', result: 'COMPLETE' } });
    expect(assessmentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { applicationId: 'app-1' } }),
    );
    expect(completenessUpsert).not.toHaveBeenCalled();
    expect(prisma.applicationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'Inhoudelijke beoordeling: volledig' }),
    });
  });
});
