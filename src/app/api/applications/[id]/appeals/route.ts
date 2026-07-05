import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

/**
 * POST /api/applications/[id]/appeals
 * Register a new appeal (bezwaar/beroep) against a decision issued on this
 * application (EHDS Art. 63, national administrative law).
 * body: { submittedBy, grounds, authority?, actingUserId }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const auth = await requireRole(body.actingUserId, ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const application = await prisma.application.findUnique({ where: { id } });
    if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (!body.submittedBy || !body.grounds) {
      return NextResponse.json({ error: 'submittedBy and grounds are required' }, { status: 422 });
    }

    const appeal = await prisma.appeal.create({
      data: {
        applicationId: id,
        submittedBy: body.submittedBy,
        grounds: body.grounds,
        authority: body.authority || null,
      },
    });

    return NextResponse.json(appeal, { status: 201 });
  } catch (e) {
    console.error('Failed to register appeal', e);
    const message = e instanceof Error ? e.message : 'Failed to register appeal';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
