import { NextRequest, NextResponse } from 'next/server';
import { getNcpApplicationDetail, mapNcpDetailZipToHdeuPayload, NcpDetailMappingError } from '@/lib/ncp-client';
import { createApplicationFromHdeuPayload } from '@/lib/hdeu';
import { requireRole } from '@/lib/authz';
import { logNcpCall } from '@/lib/ncp-log';

/**
 * POST /api/import/ncp-applications/[id]?userId=
 *
 * Step 2 of the NCP fetch flow (see ncp-client.ts): fetches one application's
 * full detail from the HDAB-NL test environment (a ZIP archive), maps it to
 * the internal HdeuPayload shape, and registers it the same way
 * /api/import/hdeu does. If the mapping fails on an application with an
 * unexpected shape, the response carries the archive's attachment names
 * (NcpDetailMappingError) so it can still be inspected by hand.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const auth = await requireRole(req.nextUrl.searchParams.get('userId'), ['CASE_HANDLER', 'ADMIN']);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const zipBuffer = await getNcpApplicationDetail(id);
    const payload = mapNcpDetailZipToHdeuPayload(zipBuffer);

    const result = await createApplicationFromHdeuPayload(payload, { source: 'ncp-application-detail', applicationId: id });
    if (!result.ok) {
      await logNcpCall({
        direction: 'OUTBOUND',
        operation: 'applications.detail',
        outcome: 'FAILURE',
        errorMessage: result.error,
        initiatedById: auth.user.id,
      });
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await logNcpCall({
      direction: 'OUTBOUND',
      operation: 'applications.detail',
      outcome: 'SUCCESS',
      applicationId: result.application.id,
      initiatedById: auth.user.id,
    });
    return NextResponse.json(
      {
        referenceNumber: result.application.referenceNumber,
        id: result.application.id,
        decisionDeadline: result.application.decisionDeadline,
      },
      { status: 201 },
    );
  } catch (e) {
    console.error(`Failed to import NCP application ${id}`, e);
    const message = e instanceof Error ? e.message : 'Failed to import application';
    const attachments = e instanceof NcpDetailMappingError ? e.attachments : undefined;
    await logNcpCall({
      direction: 'OUTBOUND',
      operation: 'applications.detail',
      outcome: 'FAILURE',
      errorMessage: message,
      initiatedById: auth.user.id,
    });
    return NextResponse.json({ error: message, attachments }, { status: 500 });
  }
}
