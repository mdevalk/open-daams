import { prisma } from '@/lib/db';
import { UserRole } from '@prisma/client';

export type FindUserResult =
  | { ok: true; user: { id: string; role: UserRole; name: string; email: string } }
  | { ok: false; status: 401; error: string };

export type AuthzResult =
  | { ok: true; user: { id: string; role: UserRole; name: string; email: string } }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Records a rejected authz check (OWASP A09 — previously only successful
 * actions were logged). No route/action label is captured here — none of
 * these functions receive request context, only userId/roles, and adding it
 * would mean touching all ~40 call sites instead of this one shared path.
 */
async function logAuthzFailure(reason: string, detail: string, attemptedUserId?: string) {
  await prisma.authzFailureLog.create({
    data: { reason, detail, attemptedUserId: attemptedUserId ?? null },
  });
}

/**
 * Resolves a client-supplied acting-user id to a real user row. Used
 * directly by routes whose permission logic isn't a fixed allowed-role list
 * (e.g. applications/[id]/transition/route.ts, which checks role against
 * the specific status transition via getAvailableTransitions) — requireRole
 * below is the fixed-role-list case, built on top of the same lookup.
 */
export async function findActingUser(userId: unknown): Promise<FindUserResult> {
  if (typeof userId !== 'string' || !userId) {
    const error = 'A valid acting user id is required';
    await logAuthzFailure('missing_user_id', error, typeof userId === 'string' ? userId : undefined);
    return { ok: false, status: 401, error };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    const error = 'Acting user not found';
    await logAuthzFailure('unknown_user', error, userId);
    return { ok: false, status: 401, error };
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
    const error = `Role ${found.user.role} is not permitted to perform this action`;
    await logAuthzFailure('role_not_permitted', error, found.user.id);
    return { ok: false, status: 403, error };
  }

  return { ok: true, user: found.user };
}

/**
 * Like requireRole, but also allows the specific owner of the resource being
 * accessed (e.g. the applicant who owns an application), not just a fixed
 * staff role list. Used by read routes where an applicant may view their own
 * record but not anyone else's.
 */
export async function requireRoleOrOwner(
  userId: unknown,
  allowedRoles: UserRole[],
  ownerId: string,
): Promise<AuthzResult> {
  const found = await findActingUser(userId);
  if (!found.ok) return found;

  if (!allowedRoles.includes(found.user.role) && found.user.id !== ownerId) {
    const error = `Role ${found.user.role} is not permitted to access this resource`;
    await logAuthzFailure('role_not_permitted', error, found.user.id);
    return { ok: false, status: 403, error };
  }

  return { ok: true, user: found.user };
}
