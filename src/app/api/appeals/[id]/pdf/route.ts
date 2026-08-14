import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fileResponse } from '@/lib/http';
import { requireRoleOrOwner } from '@/lib/authz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STAFF_ROLES = ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN', 'DATA_HOLDER'] as const;

/**
 * GET /api/appeals/[id]/pdf
 * Serves the stored, signed appeal-decision PDF (R10.0.6). Only exists once
 * the appeal reaches a terminal decision (UPHELD/REJECTED) — a missing one
 * means the appeal hasn't been decided yet, not a bug.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const appeal = await prisma.appeal.findUnique({
      where: { id },
      select: { pdf: true, application: { select: { applicantId: true } } },
    });

    if (!appeal || !appeal.pdf) {
      return new NextResponse('Not found', { status: 404 });
    }

    const requestingUserId = req.nextUrl.searchParams.get('userId');
    const auth = await requireRoleOrOwner(requestingUserId, [...STAFF_ROLES], appeal.application.applicantId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    return fileResponse(Buffer.from(appeal.pdf), `bezwaarbeslissing-${id}.pdf`, {
      mimeType: 'application/pdf',
      cacheControl: 'no-store',
    });
  } catch (e) {
    console.error(`Failed to serve appeal-decision PDF for ${id}`, e);
    const message = e instanceof Error ? e.message : 'Failed to serve appeal-decision PDF';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
