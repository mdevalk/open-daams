import { NextResponse } from 'next/server';
import { getNcpApplicationDetail, mapNcpDetailZipToHdeuPayload, NcpDetailMappingError } from '@/lib/ncp-client';
import { createApplicationFromHdeuPayload } from '@/lib/hdeu';

/**
 * POST /api/import/ncp-applications/[id]
 *
 * Step 2 of the NCP fetch flow (see ncp-client.ts): fetches one application's
 * full detail from the HDAB-NL test environment (a ZIP archive), maps it to
 * the internal HdeuPayload shape, and registers it the same way
 * /api/import/hdeu does. If the mapping fails on an application with an
 * unexpected shape, the response carries the archive's attachment names
 * (NcpDetailMappingError) so it can still be inspected by hand.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const zipBuffer = await getNcpApplicationDetail(id);
    const payload = mapNcpDetailZipToHdeuPayload(zipBuffer);

    const result = await createApplicationFromHdeuPayload(payload, { source: 'ncp-application-detail', applicationId: id });
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
    console.error(`Failed to import NCP application ${id}`, e);
    const message = e instanceof Error ? e.message : 'Failed to import application';
    const attachments = e instanceof NcpDetailMappingError ? e.attachments : undefined;
    return NextResponse.json({ error: message, attachments }, { status: 500 });
  }
}
