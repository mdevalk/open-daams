import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    authzFailureLog: { create: vi.fn() },
  },
}));

import { prisma } from '@/lib/db';
import { findActingUser, requireRole, requireRoleOrOwner } from '@/lib/authz';

const findUnique = vi.mocked(prisma.user.findUnique);
const logCreate = vi.mocked(prisma.authzFailureLog.create);

const CASE_HANDLER = { id: 'u-1', role: 'CASE_HANDLER' as const, name: 'S. Bakker', email: 'casehandler@hdab.nl' };
const APPLICANT = { id: 'u-2', role: 'APPLICANT' as const, name: 'A. de Vries', email: 'researcher@umcu.nl' };

beforeEach(() => {
  findUnique.mockReset();
  logCreate.mockReset();
});

describe('findActingUser', () => {
  it('rejects a missing or non-string userId without querying the database', async () => {
    const result = await findActingUser(undefined);
    expect(result).toEqual({ ok: false, status: 401, error: 'A valid acting user id is required' });
    expect(findUnique).not.toHaveBeenCalled();
    expect(logCreate).toHaveBeenCalledWith({
      data: { reason: 'missing_user_id', detail: expect.any(String), attemptedUserId: null },
    });
  });

  it('rejects an unknown user id and logs the failure', async () => {
    findUnique.mockResolvedValue(null);
    const result = await findActingUser('ghost');
    expect(result).toEqual({ ok: false, status: 401, error: 'Acting user not found' });
    expect(logCreate).toHaveBeenCalledWith({
      data: { reason: 'unknown_user', detail: expect.any(String), attemptedUserId: 'ghost' },
    });
  });

  it('returns the user row on success without logging a failure', async () => {
    findUnique.mockResolvedValue(CASE_HANDLER as never);
    const result = await findActingUser('u-1');
    expect(result).toEqual({ ok: true, user: CASE_HANDLER });
    expect(logCreate).not.toHaveBeenCalled();
  });
});

describe('requireRole', () => {
  it('allows a user whose role is in the allowed list', async () => {
    findUnique.mockResolvedValue(CASE_HANDLER as never);
    const result = await requireRole('u-1', ['CASE_HANDLER', 'ADMIN']);
    expect(result).toEqual({ ok: true, user: CASE_HANDLER });
  });

  it('rejects a user whose role is not in the allowed list and logs it', async () => {
    findUnique.mockResolvedValue(APPLICANT as never);
    const result = await requireRole('u-2', ['CASE_HANDLER', 'ADMIN']);
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: 'Role APPLICANT is not permitted to perform this action',
    });
    expect(logCreate).toHaveBeenCalledWith({
      data: { reason: 'role_not_permitted', detail: expect.any(String), attemptedUserId: 'u-2' },
    });
  });

  it('propagates the 401 from findActingUser without a second lookup', async () => {
    findUnique.mockResolvedValue(null);
    const result = await requireRole('ghost', ['ADMIN']);
    expect(result).toEqual({ ok: false, status: 401, error: 'Acting user not found' });
  });
});

describe('requireRoleOrOwner', () => {
  it('allows the resource owner even when their role is not in the allowed list', async () => {
    findUnique.mockResolvedValue(APPLICANT as never);
    const result = await requireRoleOrOwner('u-2', ['CASE_HANDLER'], 'u-2');
    expect(result).toEqual({ ok: true, user: APPLICANT });
    expect(logCreate).not.toHaveBeenCalled();
  });

  it('rejects a non-owner whose role is not in the allowed list', async () => {
    findUnique.mockResolvedValue(APPLICANT as never);
    const result = await requireRoleOrOwner('u-2', ['CASE_HANDLER'], 'someone-else');
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: 'Role APPLICANT is not permitted to access this resource',
    });
    expect(logCreate).toHaveBeenCalledWith({
      data: { reason: 'role_not_permitted', detail: expect.any(String), attemptedUserId: 'u-2' },
    });
  });

  it('allows a user whose role is in the allowed list regardless of ownership', async () => {
    findUnique.mockResolvedValue(CASE_HANDLER as never);
    const result = await requireRoleOrOwner('u-1', ['CASE_HANDLER'], 'someone-else');
    expect(result).toEqual({ ok: true, user: CASE_HANDLER });
  });
});
