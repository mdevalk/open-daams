import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export type CompletenessItem = {
  key: string;
  label: string;
  passed: boolean;
  comment?: string;
};

/**
 * POST /api/applications/[id]/completeness-check
 * Create or update the structured completeness check (TEHDAS2 D6.3 Ch. 5,
 * Annex 7/8), distinct from the substantive assessment that follows it.
 * body: { items: CompletenessItem[], result: 'PENDING'|'COMPLETE'|'INCOMPLETE', checkedById }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const application = await prisma.application.findUnique({ where: { id } });
    if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: 'items must be an array' }, { status: 422 });
    }

    const check = await prisma.completenessCheck.upsert({
      where: { applicationId: id },
      create: {
        applicationId: id,
        items: body.items,
        result: body.result ?? 'PENDING',
        checkedById: body.checkedById ?? null,
        checkedAt: body.result && body.result !== 'PENDING' ? new Date() : null,
      },
      update: {
        items: body.items,
        result: body.result ?? 'PENDING',
        checkedById: body.checkedById ?? null,
        checkedAt: body.result && body.result !== 'PENDING' ? new Date() : null,
      },
    });

    return NextResponse.json(check, { status: 201 });
  } catch (e) {
    console.error('Failed to save completeness check', e);
    const message = e instanceof Error ? e.message : 'Failed to save completeness check';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
