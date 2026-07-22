import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { regenerateStoredPermitPdf } from '@/lib/permit-pdf-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/permits/[id]/pdf
 * Serves the stored, official permit PDF (kept in sync with every mutation
 * that affects its content — see lib/permit-pdf-store.ts). Falls back to
 * generating it on the fly for permits that predate that mechanism, which
 * also heals the stored copy for next time.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let permit = await prisma.dataPermit.findUnique({
    where: { id },
    select: { pdf: true, permitNumber: true, version: true },
  });

  if (!permit) {
    return new NextResponse('Not found', { status: 404 });
  }

  if (!permit.pdf) {
    await regenerateStoredPermitPdf(id, prisma);
    permit = await prisma.dataPermit.findUniqueOrThrow({
      where: { id },
      select: { pdf: true, permitNumber: true, version: true },
    });
  }

  const filename = `vergunning-${permit.permitNumber.replace(/\//g, '-')}-v${permit.version}.pdf`;

  return new NextResponse(Buffer.from(permit.pdf!), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
