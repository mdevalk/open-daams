import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const handleI18nRouting = createMiddleware(routing);

// Nonce-based CSP (see node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md)
// requires dynamic rendering — every page under src/app/[locale] already reads searchParams or
// sets `dynamic = 'force-dynamic'`, so there's no static-optimization cost being traded away here.
export function proxy(request: NextRequest) {
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

  request.headers.set('x-nonce', nonce);
  request.headers.set('Content-Security-Policy', contentSecurityPolicyHeaderValue);

  const response = handleI18nRouting(request);

  response.headers.set('Content-Security-Policy', contentSecurityPolicyHeaderValue);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');

  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
