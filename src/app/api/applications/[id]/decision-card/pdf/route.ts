import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fileResponse } from '@/lib/http';

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

  try {
    const application = await prisma.application.findUnique({
      where: { id },
      select: { decisionCardPdf: true, decisionId: true },
    });

    if (!application || !application.decisionCardPdf || !application.decisionId) {
      return new NextResponse('Not found', { status: 404 });
    }

    const filename = `besluit-${application.decisionId.replace(/\//g, '-')}.pdf`;

    return fileResponse(Buffer.from(application.decisionCardPdf), filename, {
      mimeType: 'application/pdf',
      cacheControl: 'no-store',
    });
  } catch (e) {
    console.error(`Failed to serve decision-card PDF for ${id}`, e);
    const message = e instanceof Error ? e.message : 'Failed to serve decision-card PDF';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
