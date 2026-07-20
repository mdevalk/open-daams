import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildDigitalPermitDocument } from '@/lib/permit-signing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/permits/[id]/json
 * The digital permit itself: the signed, structured record (D6.4 R9.1.3).
 * The PDF is a human-readable rendering derived from this; this document is
 * the artifact independently verifiable against /.well-known/jwks.json.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const permit = await prisma.dataPermit.findUnique({ where: { id } });
  if (!permit) {
    return NextResponse.json({ error: 'Permit not found' }, { status: 404 });
  }

  const document = buildDigitalPermitDocument(permit);
  const filename = `${document.permitId.replace(/\//g, '-')}.json`;

  return new NextResponse(JSON.stringify(document, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
