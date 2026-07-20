import { NextResponse } from 'next/server';
import { getPublicJwk } from '@/lib/permit-signing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /.well-known/jwks.json
 * Publishes this HDAB instance's public signing key so permit signatures
 * (D6.4 R9.1.3) can be verified independently, following RFC 7517.
 */
export async function GET() {
  return NextResponse.json({ keys: [getPublicJwk()] });
}
