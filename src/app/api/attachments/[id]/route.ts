import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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

  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(attachment.content), {
    status: 200,
    headers: {
      'Content-Type': attachment.mimeType ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename="${attachment.filename}"`,
    },
  });
}
