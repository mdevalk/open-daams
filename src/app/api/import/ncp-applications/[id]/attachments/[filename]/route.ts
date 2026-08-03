import { NextResponse } from 'next/server';
import { getNcpApplicationAttachment } from '@/lib/ncp-client';

const CONTENT_TYPES: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pdf: 'application/pdf',
  xml: 'application/xml',
  json: 'application/json',
  txt: 'text/plain',
};

/**
 * GET /api/import/ncp-applications/[id]/attachments/[filename]
 *
 * Lets a human open/download one attachment from an NCP application's
 * detail archive directly — needed while mapNcpDetailZipToHdeuPayload's
 * real field mapping is still a placeholder and attachments (DOCX, etc.)
 * are the only way to inspect some of the real application content.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; filename: string }> },
) {
  const { id, filename } = await params;
  const decodedFilename = decodeURIComponent(filename);

  try {
    const data = await getNcpApplicationAttachment(id, decodedFilename);
    const ext = decodedFilename.split('.').pop()?.toLowerCase() ?? '';
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
        'Content-Disposition': `inline; filename="${decodedFilename}"`,
      },
    });
  } catch (e) {
    console.error(`Failed to fetch NCP attachment ${decodedFilename} for application ${id}`, e);
    const message = e instanceof Error ? e.message : 'Failed to fetch attachment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
