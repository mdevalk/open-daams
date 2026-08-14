import { NextRequest, NextResponse } from 'next/server';
import { parseHdeuPayload, createApplicationFromHdeuPayload } from '@/lib/hdeu';
import { requireRole } from '@/lib/authz';

/**
 * POST /api/import/hdeu?userId=
 *
 * Accepts a HealthData@EU NCP JSON payload and registers it as a new
 * cross-border application in SUBMITTED state, decision clock starting from
 * this national DAAMS's own import time (R8.0.7 — see
 * createApplicationFromHdeuPayload). This is a staff-initiated UI action
 * (the "Import application" form), not an externally-triggered webhook —
 * `userId` is a query param, not a body field, since the body is the raw
 * external payload verbatim.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req.nextUrl.searchParams.get('userId'), ['CASE_HANDLER', 'ADMIN']);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const parsed = parseHdeuPayload(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.errors }, { status: 422 });
    }

    const result = await createApplicationFromHdeuPayload(parsed.payload, body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(
      {
        referenceNumber: result.application.referenceNumber,
        id: result.application.id,
        decisionDeadline: result.application.decisionDeadline,
      },
      { status: 201 },
    );
  } catch (e) {
    console.error('Failed to import HD@EU application', e);
    const message = e instanceof Error ? e.message : 'Failed to import application';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
