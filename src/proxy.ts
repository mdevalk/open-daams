import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { routing } from './i18n/routing';

const handleI18nRouting = createMiddleware(routing);

// Every page requires a session except the deliberately-public transparency
// register and the sign-in page itself — matches with or without a locale
// prefix, since this runs before next-intl has normalised the path.
const UNGATED_PATH = /^\/(?:(?:nl|en|fr)\/)?(?:public(?:\/|$)|auth\/signin(?:\/|$))/;

function localeFromPathname(pathname: string): string {
  const match = /^\/(nl|en|fr)(?:\/|$)/.exec(pathname);
  return match ? match[1] : routing.defaultLocale;
}

function applySecurityHeaders(response: NextResponse, csp: string) {
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  return response;
}

// Nonce-based CSP (see node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md)
// requires dynamic rendering — every page under src/app/[locale] already reads searchParams or
// sets `dynamic = 'force-dynamic'`, so there's no static-optimization cost being traded away here.
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';

  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''};
    style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`};
    img-src 'self' blob: data:;
    font-src 'self';
    connect-src 'self'${isDev ? ' ws: wss:' : ''};
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `;
  const contentSecurityPolicyHeaderValue = cspHeader.replace(/\s{2,}/g, ' ').trim();

  // Optimistic check only — cookie presence + signature, no DB call. The
  // real enforcement stays in each page/route via auth() + the unchanged
  // authz.ts (Next's own guidance: never rely on Proxy alone, a matcher
  // change could silently remove this coverage).
  if (!UNGATED_PATH.test(request.nextUrl.pathname)) {
    const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
    if (!token) {
      const locale = localeFromPathname(request.nextUrl.pathname);
      const signInUrl = new URL(`/${locale}/auth/signin`, request.url);
      signInUrl.searchParams.set('callbackUrl', request.nextUrl.pathname + request.nextUrl.search);
      return applySecurityHeaders(NextResponse.redirect(signInUrl), contentSecurityPolicyHeaderValue);
    }
  }

  request.headers.set('x-nonce', nonce);
  request.headers.set('Content-Security-Policy', contentSecurityPolicyHeaderValue);

  const response = handleI18nRouting(request);

  return applySecurityHeaders(response, contentSecurityPolicyHeaderValue);
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
