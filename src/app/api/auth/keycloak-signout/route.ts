import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * GET /api/auth/keycloak-signout
 *
 * Auth.js's own signOut() only clears this app's session cookie — it does
 * not end Keycloak's SSO session, so a later sign-in would silently
 * re-authenticate as the same user with no login prompt. AuthStatus calls
 * this route (while the session is still valid) to get Keycloak's
 * RP-initiated logout URL, then clears the local session, then navigates
 * there — completing a real sign-out for demo identity-switching.
 */
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  const idToken = typeof token?.idToken === 'string' ? token.idToken : undefined;
  const issuer = process.env.AUTH_KEYCLOAK_ISSUER;

  if (!idToken || !issuer) {
    return NextResponse.json({ url: null });
  }

  const endSessionUrl = new URL(`${issuer}/protocol/openid-connect/logout`);
  endSessionUrl.searchParams.set('id_token_hint', idToken);
  if (process.env.AUTH_URL) {
    endSessionUrl.searchParams.set('post_logout_redirect_uri', process.env.AUTH_URL);
  }

  return NextResponse.json({ url: endSessionUrl.toString() });
}
