import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { AppealStatus } from '@prisma/client';
import { requireRole } from '@/lib/authz';

const TERMINAL_STATUSES: AppealStatus[] = ['UPHELD', 'REJECTED', 'WITHDRAWN'];

/**
 * PATCH /api/appeals/[id]
 * Update the status/decision of an in-progress appeal.
 * body: { status, decisionSummary?, actingUserId }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const auth = await requireRole(body.actingUserId, ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const appeal = await prisma.appeal.findUnique({ where: { id } });
    if (!appeal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const status = body.status as AppealStatus;
    if (!['SUBMITTED', 'UNDER_REVIEW', 'UPHELD', 'REJECTED', 'WITHDRAWN'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 422 });
    }

    const updated = await prisma.appeal.update({
      where: { id },
      data: {
        status,
        decisionSummary: body.decisionSummary ?? appeal.decisionSummary,
        decisionAt: TERMINAL_STATUSES.includes(status) ? new Date() : appeal.decisionAt,
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error('Failed to update appeal', e);
    const message = e instanceof Error ? e.message : 'Failed to update appeal';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
