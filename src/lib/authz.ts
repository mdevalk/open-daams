import { prisma } from '@/lib/db';
import { UserRole } from '@prisma/client';

export type AuthzResult =
  | { ok: true; user: { id: string; role: UserRole; name: string; email: string; organisation: string } }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Server-side role check. Currently trusts a plain `userId` passed by the
 * client (there is no session/auth layer yet), but centralises the check so
 * swapping in real authentication only requires changing this function.
 */
export async function requireRole(userId: unknown, allowedRoles: UserRole[]): Promise<AuthzResult> {
  if (typeof userId !== 'string' || !userId) {
    return { ok: false, status: 401, error: 'A valid acting user id is required' };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { ok: false, status: 401, error: 'Acting user not found' };
  }

  if (!allowedRoles.includes(user.role)) {
    return {
      ok: false,
      status: 403,
      error: `Role ${user.role} is not permitted to perform this action`,
    };
  }

  return { ok: true, user };
}
