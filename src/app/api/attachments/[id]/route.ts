import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fileResponse } from '@/lib/http';

/**
 * GET /api/attachments/[id]
 *
 * Serves an attachment's bytes straight from the database. Attachment
 * content is extracted from the NCP detail archive once, at import time
 * (see mapNcpDetailZipToHdeuPayload) — the NCP is a message gateway, not a
 * store, so retrieval here never calls back out to it.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    return fileResponse(attachment.content, attachment.filename, {
      mimeType: attachment.mimeType ?? 'application/octet-stream',
      disposition: 'inline',
    });
  } catch (e) {
    console.error(`Failed to serve attachment ${id}`, e);
    const message = e instanceof Error ? e.message : 'Failed to serve attachment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
