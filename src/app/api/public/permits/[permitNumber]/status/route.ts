import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Public data with no auth, meant to be polled cross-origin by third parties
// (e.g. hdab-nl-permit-validator, running on a different origin/port) — so,
// unlike the rest of the app, this specific route needs an explicit CORS
// allow-all or the browser silently blocks the response before JS ever sees it.
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

/**
 * GET /api/public/permits/[permitNumber]/status
 *
 * Public, unauthenticated status check — deliberately separate from the
 * staff-authenticated /api/permits/[id]/... routes (which take an internal
 * version id, not a stable permit number). Lets a third party (e.g. the
 * hdab-nl-permit-validator project) confirm whether a permit it holds is
 * still the current version, and whether it's been revoked, without needing
 * the full digital permit document — same public-register philosophy as
 * src/app/[locale]/public/page.tsx (Art. 57(1)(j)(ii), 58, 61(4)), applied
 * to permits instead of applications/decisions.
 *
 * 404s (rather than leaking status) for a permit number that doesn't exist,
 * or whose application hasn't had its decision published yet — mirrors the
 * publication gate the public register page already applies. In practice
 * this second case is nearly unreachable: decisionPublishedAt is set
 * automatically the moment any decision is issued.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ permitNumber: string }> },
) {
  const { permitNumber } = await params;

  try {
    const permit = await prisma.dataPermit.findFirst({
      where: { permitNumber, isCurrent: true },
      select: {
        permitNumber: true,
        version: true,
        status: true,
        revocationReason: true,
        revocationAt: true,
        application: { select: { decisionPublishedAt: true } },
      },
    });

    if (!permit || !permit.application.decisionPublishedAt) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: CORS_HEADERS });
    }

    return NextResponse.json(
      {
        permitNumber: permit.permitNumber,
        currentVersion: permit.version,
        status: permit.status,
        revoked: permit.status === 'REVOKED',
        revocationReason: permit.revocationReason,
        revocationAt: permit.revocationAt,
      },
      { headers: { 'Cache-Control': 'no-store', ...CORS_HEADERS } },
    );
  } catch (e) {
    console.error(`Failed to look up public permit status for ${permitNumber}`, e);
    const message = e instanceof Error ? e.message : 'Failed to look up permit status';
    return NextResponse.json({ error: message }, { status: 500, headers: CORS_HEADERS });
  }
}
