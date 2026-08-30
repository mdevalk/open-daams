import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { actingUserId } from '@/auth';

/**
 * Resolves the signed-in (or "Act as"-impersonated) user's full row for a
 * server component — a drop-in replacement for the old
 * `?userId=`/UserSwitcher default-to-first-admin pattern. Redirects to
 * Keycloak sign-in when there's no session; there's no more anonymous
 * access to these pages now that real auth exists.
 */
export async function requireCurrentUser(locale: string) {
  const userId = await actingUserId();
  const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
  if (!user) redirect(`/api/auth/signin?callbackUrl=/${locale}`);
  return user;
}
