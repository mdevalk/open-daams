import { prisma } from '@/lib/db';
import { UserRole } from '@prisma/client';

export type FindUserResult =
  | { ok: true; user: { id: string; role: UserRole; name: string; email: string } }
  | { ok: false; status: 401; error: string };

export type AuthzResult =
  | { ok: true; user: { id: string; role: UserRole; name: string; email: string } }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Resolves a client-supplied acting-user id to a real user row. Used
 * directly by routes whose permission logic isn't a fixed allowed-role list
 * (e.g. applications/[id]/transition/route.ts, which checks role against
 * the specific status transition via getAvailableTransitions) — requireRole
 * below is the fixed-role-list case, built on top of the same lookup.
 */
export async function findActingUser(userId: unknown): Promise<FindUserResult> {
  if (typeof userId !== 'string' || !userId) {
    return { ok: false, status: 401, error: 'A valid acting user id is required' };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { ok: false, status: 401, error: 'Acting user not found' };
  }

  return { ok: true, user };
}

/**
 * Server-side role check. Currently trusts a plain `userId` passed by the
 * client (there is no session/auth layer yet), but centralises the check so
 * swapping in real authentication only requires changing this function.
 */
export async function requireRole(userId: unknown, allowedRoles: UserRole[]): Promise<AuthzResult> {
  const found = await findActingUser(userId);
  if (!found.ok) return found;

  if (!allowedRoles.includes(found.user.role)) {
    return {
      ok: false,
      status: 403,
      error: `Role ${found.user.role} is not permitted to perform this action`,
    };
  }

  return { ok: true, user: found.user };
}
