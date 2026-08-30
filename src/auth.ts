import NextAuth from 'next-auth';
import type { DefaultSession } from 'next-auth';
import Keycloak from 'next-auth/providers/keycloak';
import { prisma } from '@/lib/db';
import { UserRole } from '@prisma/client';

type ImpersonationClaims = {
  impersonatedUserId?: string;
  impersonatedName?: string;
  impersonatedRole?: UserRole;
};

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      internalUserId?: string;
      role?: UserRole;
    } & ImpersonationClaims;
  }
}

declare module '@auth/core/jwt' {
  interface JWT extends ImpersonationClaims {
    internalUserId?: string;
    role?: UserRole;
    idToken?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Keycloak],
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  // The branded sign-in page at src/app/[locale]/auth/signin — proxy.ts
  // redirects to the locale-aware variant directly; this fallback (default
  // locale) only matters for Auth.js's own internal redirects (e.g. an
  // AccessDenied error from the signIn callback below).
  pages: { signIn: '/nl/auth/signin' },
  callbacks: {
    // Reject sign-in for any Keycloak identity that isn't one of the seeded
    // app users — there's no self-service provisioning, the closed world of
    // demo users (or later, real staff/applicant accounts) is managed in
    // Postgres, not created on first login.
    async signIn({ profile }) {
      if (!profile?.email) return false;
      const user = await prisma.user.findUnique({ where: { email: profile.email } });
      return !!user;
    },
    // Resolve the Keycloak login to the existing internal User.id once, on
    // first sign-in, and carry it in the token — same for `role`, needed
    // only to gate the "Act as" impersonation UI to real ADMINs, never used
    // for authorization itself (authz.ts keeps re-reading role fresh from
    // Postgres on every request via actingUserId(), unchanged). The raw
    // Keycloak id_token is kept for RP-initiated logout (see
    // /api/auth/keycloak-signout) — Auth.js's own signOut() only clears our
    // cookie, not Keycloak's SSO session.
    //
    // `trigger === 'update'` handles the "Act as" flow: the client calls
    // useSession().update({ impersonatedUserId }) from AuthStatus. Re-checks
    // the REAL user's role fresh from Postgres on every call — never trusts
    // a stale token.role or a client-supplied flag.
    async jwt({ token, account, profile, trigger, session }) {
      if (account && profile?.email) {
        const user = await prisma.user.findUnique({ where: { email: profile.email } });
        if (user) {
          token.internalUserId = user.id;
          token.role = user.role;
        }
        if (account.id_token) token.idToken = account.id_token;
      }

      if (trigger === 'update' && session && typeof session === 'object' && 'impersonatedUserId' in session) {
        const realUser = token.internalUserId
          ? await prisma.user.findUnique({ where: { id: token.internalUserId } })
          : null;

        if (realUser?.role === 'ADMIN') {
          const targetId = (session as { impersonatedUserId: string | null }).impersonatedUserId;
          if (targetId === null) {
            token.impersonatedUserId = undefined;
            token.impersonatedName = undefined;
            token.impersonatedRole = undefined;
          } else {
            const target = await prisma.user.findUnique({ where: { id: targetId } });
            if (target) {
              token.impersonatedUserId = target.id;
              token.impersonatedName = target.name;
              token.impersonatedRole = target.role;
            }
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token.internalUserId) session.user.internalUserId = token.internalUserId;
      if (token.role) session.user.role = token.role;
      if (token.impersonatedUserId) {
        session.user.impersonatedUserId = token.impersonatedUserId;
        session.user.impersonatedName = token.impersonatedName;
        session.user.impersonatedRole = token.impersonatedRole;
      }
      return session;
    },
  },
});

// Drop-in replacement for the client-supplied `userId`/`actingUserId` value
// that used to travel via query string or request body — same shape (a
// User.id string), now server-verified instead of client-supplied. Returns
// the impersonated user when an ADMIN has "Act as" active, otherwise the
// real signed-in user — requireRole/requireRoleOrOwner then naturally
// evaluate against whichever one's actual role.
export async function actingUserId() {
  const session = await auth();
  return session?.user?.impersonatedUserId ?? session?.user?.internalUserId;
}
