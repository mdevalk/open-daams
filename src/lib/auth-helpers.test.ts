import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JWT } from '@auth/core/jwt';

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

import { prisma } from '@/lib/db';
import { resolveSignInClaims, resolveImpersonationUpdate } from '@/lib/auth-helpers';

const findUnique = vi.mocked(prisma.user.findUnique);

beforeEach(() => {
  findUnique.mockReset();
});

function makeToken(overrides: Partial<JWT> = {}): JWT {
  return { ...overrides } as JWT;
}

describe('resolveSignInClaims', () => {
  it('does nothing without an account (not a fresh sign-in)', async () => {
    const token = makeToken();
    await resolveSignInClaims(token, null, { email: 'admin@hdab.nl' });
    expect(findUnique).not.toHaveBeenCalled();
    expect(token.internalUserId).toBeUndefined();
  });

  it('does nothing without a profile email', async () => {
    const token = makeToken();
    await resolveSignInClaims(token, { provider: 'keycloak' } as never, undefined);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('sets internalUserId/role from the matching User row', async () => {
    findUnique.mockResolvedValue({ id: 'u-1', role: 'ADMIN' } as never);
    const token = makeToken();
    await resolveSignInClaims(token, { provider: 'keycloak' } as never, { email: 'admin@hdab.nl' });
    expect(findUnique).toHaveBeenCalledWith({ where: { email: 'admin@hdab.nl' } });
    expect(token.internalUserId).toBe('u-1');
    expect(token.role).toBe('ADMIN');
  });

  it('leaves internalUserId/role unset when no matching User row exists', async () => {
    findUnique.mockResolvedValue(null);
    const token = makeToken();
    await resolveSignInClaims(token, { provider: 'keycloak' } as never, { email: 'ghost@hdab.nl' });
    expect(token.internalUserId).toBeUndefined();
  });

  it('stashes the raw id_token when present', async () => {
    findUnique.mockResolvedValue(null);
    const token = makeToken();
    await resolveSignInClaims(token, { provider: 'keycloak', id_token: 'raw-id-token' } as never, {
      email: 'admin@hdab.nl',
    });
    expect(token.idToken).toBe('raw-id-token');
  });
});

describe('resolveImpersonationUpdate', () => {
  it('does nothing when trigger is not "update"', async () => {
    const token = makeToken({ internalUserId: 'u-1' });
    await resolveImpersonationUpdate(token, undefined, { impersonatedUserId: 'u-2' });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('does nothing when the update session has no impersonatedUserId key', async () => {
    const token = makeToken({ internalUserId: 'u-1' });
    await resolveImpersonationUpdate(token, 'update', { somethingElse: true });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('does nothing when the real user cannot be resolved (no internalUserId yet)', async () => {
    const token = makeToken();
    await resolveImpersonationUpdate(token, 'update', { impersonatedUserId: 'u-2' });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects the update when the real user is not ADMIN', async () => {
    findUnique.mockResolvedValue({ id: 'u-1', role: 'CASE_HANDLER' } as never);
    const token = makeToken({ internalUserId: 'u-1' });
    await resolveImpersonationUpdate(token, 'update', { impersonatedUserId: 'u-2' });
    expect(token.impersonatedUserId).toBeUndefined();
  });

  it('sets impersonatedUserId/name/role when the real user is ADMIN and the target exists', async () => {
    findUnique
      .mockResolvedValueOnce({ id: 'u-1', role: 'ADMIN' } as never) // real user lookup
      .mockResolvedValueOnce({ id: 'u-2', name: 'S. Bakker', role: 'CASE_HANDLER' } as never); // target lookup
    const token = makeToken({ internalUserId: 'u-1' });
    await resolveImpersonationUpdate(token, 'update', { impersonatedUserId: 'u-2' });
    expect(token.impersonatedUserId).toBe('u-2');
    expect(token.impersonatedName).toBe('S. Bakker');
    expect(token.impersonatedRole).toBe('CASE_HANDLER');
  });

  it('leaves impersonation unset when the target user does not exist', async () => {
    findUnique
      .mockResolvedValueOnce({ id: 'u-1', role: 'ADMIN' } as never)
      .mockResolvedValueOnce(null);
    const token = makeToken({ internalUserId: 'u-1' });
    await resolveImpersonationUpdate(token, 'update', { impersonatedUserId: 'ghost' });
    expect(token.impersonatedUserId).toBeUndefined();
  });

  it('clears impersonation when impersonatedUserId is explicitly null ("stop")', async () => {
    findUnique.mockResolvedValueOnce({ id: 'u-1', role: 'ADMIN' } as never);
    const token = makeToken({
      internalUserId: 'u-1',
      impersonatedUserId: 'u-2',
      impersonatedName: 'S. Bakker',
      impersonatedRole: 'CASE_HANDLER',
    });
    await resolveImpersonationUpdate(token, 'update', { impersonatedUserId: null });
    expect(token.impersonatedUserId).toBeUndefined();
    expect(token.impersonatedName).toBeUndefined();
    expect(token.impersonatedRole).toBeUndefined();
  });
});
