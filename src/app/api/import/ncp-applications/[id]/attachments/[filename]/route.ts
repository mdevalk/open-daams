import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import { getNcpApplicationDetail, guessAttachmentMimeType, resolveAttachmentBytes } from '@/lib/ncp-client';
import { fileResponse } from '@/lib/http';
import { requireRole } from '@/lib/authz';

/**
 * GET /api/import/ncp-applications/[id]/attachments/[filename]?userId=
 *
 * Lets a case handler inspect one file from an NCP application's detail
 * archive before deciding to import it — used for the queue's "View JSON"
 * link (application_metadata.json) and for the per-attachment links shown
 * when NcpDetailMappingError surfaces a mapping failure. Re-fetches the
 * archive from the NCP on every call (same as the POST import route); there
 * is nothing to persist yet since no application row exists at this point.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; filename: string }> }) {
  const { id, filename } = await params;

  const auth = await requireRole(req.nextUrl.searchParams.get('userId'), ['CASE_HANDLER', 'ADMIN']);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const zipBuffer = await getNcpApplicationDetail(id);
    const zip = new AdmZip(zipBuffer);
    const bytes = resolveAttachmentBytes(zip, undefined, filename);
    if (!bytes) {
      return NextResponse.json({ error: `${filename} not found in NCP application ${id}` }, { status: 404 });
    }

    return fileResponse(bytes, filename, { mimeType: guessAttachmentMimeType(filename), disposition: 'inline' });
  } catch (e) {
    console.error(`Failed to fetch NCP attachment ${filename} for application ${id}`, e);
    const message = e instanceof Error ? e.message : 'Failed to fetch attachment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
