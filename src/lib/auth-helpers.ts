import type { Account, Profile } from 'next-auth';
import type { JWT } from '@auth/core/jwt';
import { prisma } from '@/lib/db';

/**
 * Resolves a fresh Keycloak sign-in to the internal User.id, and stashes the
 * raw id_token for RP-initiated logout. Mutates `token` in place, matching
 * the shape Auth.js's `jwt` callback expects to keep passing forward.
 */
export async function resolveSignInClaims(
  token: JWT,
  account: Account | null | undefined,
  profile: Profile | undefined,
): Promise<void> {
  if (!account || !profile?.email) return;

  const user = await prisma.user.findUnique({ where: { email: profile.email } });
  if (user) {
    token.internalUserId = user.id;
    token.role = user.role;
  }
  if (account.id_token) token.idToken = account.id_token;
}

/**
 * Handles the "Act as" flow: the client calls useSession().update({
 * impersonatedUserId }) from AdminMenu. Re-checks the REAL user's role fresh
 * from Postgres on every call — never trusts a stale token.role or a
 * client-supplied flag. Mutates `token` in place.
 */
export async function resolveImpersonationUpdate(
  token: JWT,
  trigger: string | undefined,
  session: unknown,
): Promise<void> {
  if (trigger !== 'update' || !session || typeof session !== 'object' || !('impersonatedUserId' in session)) {
    return;
  }

  const realUser = token.internalUserId
    ? await prisma.user.findUnique({ where: { id: token.internalUserId } })
    : null;
  if (realUser?.role !== 'ADMIN') return;

  const targetId = (session as { impersonatedUserId: string | null }).impersonatedUserId;
  if (targetId === null) {
    token.impersonatedUserId = undefined;
    token.impersonatedName = undefined;
    token.impersonatedRole = undefined;
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return;
  token.impersonatedUserId = target.id;
  token.impersonatedName = target.name;
  token.impersonatedRole = target.role;
}
