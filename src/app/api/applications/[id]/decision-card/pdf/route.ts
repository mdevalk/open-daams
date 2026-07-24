import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/applications/[id]/decision-card/pdf
 * Serves the stored decision-card PDF (unsigned pre-permit for a positive
 * decision, signed decision document for a negative one — D6.4 §9.2). Unlike
 * the permit PDF route, there's no on-the-fly regeneration fallback: a
 * decision card is fixed at DECISION_ISSUED time and never mutates
 * afterward, so a missing one indicates a bug, not a legitimate
 * predates-this-feature case.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const application = await prisma.application.findUnique({
    where: { id },
    select: { decisionCardPdf: true, decisionId: true },
  });

  if (!application || !application.decisionCardPdf || !application.decisionId) {
    return new NextResponse('Not found', { status: 404 });
  }

  const filename = `besluit-${application.decisionId.replace(/\//g, '-')}.pdf`;

  return new NextResponse(Buffer.from(application.decisionCardPdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
