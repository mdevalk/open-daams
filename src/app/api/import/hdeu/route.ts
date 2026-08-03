import { NextRequest, NextResponse } from 'next/server';
import { parseHdeuPayload, createApplicationFromHdeuPayload } from '@/lib/hdeu';

/**
 * POST /api/import/hdeu
 *
 * Accepts a HealthData@EU NCP JSON payload and registers it as a new
 * cross-border application in SUBMITTED state (clock starts immediately
 * because the application was already assessed for completeness by the
 * sending Member State's HDAB before transmission).
 */
export async function POST(req: NextRequest) {
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
