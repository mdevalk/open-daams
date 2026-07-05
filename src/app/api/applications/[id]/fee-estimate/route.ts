import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

const MANAGE_ROLES = ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'] as const;

/**
 * POST /api/applications/[id]/fee-estimate
 * Create or update the cost estimate sent to the applicant during
 * assessment, before a decision is made (TEHDAS2 D6.3 §6.5, EHDS Art. 62(5)).
 * body: { administrativeFee?, dataPreparationFee?, dataHolderFee?, notes?, currency?, actingUserId }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const auth = await requireRole(body.actingUserId, [...MANAGE_ROLES]);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const application = await prisma.application.findUnique({ where: { id } });
    if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const administrativeFee = body.administrativeFee !== undefined && body.administrativeFee !== ''
      ? Number(body.administrativeFee) : null;
    const dataPreparationFee = body.dataPreparationFee !== undefined && body.dataPreparationFee !== ''
      ? Number(body.dataPreparationFee) : null;
    const dataHolderFee = body.dataHolderFee !== undefined && body.dataHolderFee !== ''
      ? Number(body.dataHolderFee) : null;

    const totalAmount = [administrativeFee, dataPreparationFee, dataHolderFee]
      .reduce((sum: number, v) => sum + (v ?? 0), 0);

    const feeEstimate = await prisma.feeEstimate.upsert({
      where: { applicationId: id },
      create: {
        applicationId: id,
        currency: body.currency ?? 'EUR',
        administrativeFee,
        dataPreparationFee,
        dataHolderFee,
        totalAmount,
        notes: body.notes ?? null,
        status: 'PENDING',
        sentAt: new Date(),
      },
      update: {
        currency: body.currency ?? 'EUR',
        administrativeFee,
        dataPreparationFee,
        dataHolderFee,
        totalAmount,
        notes: body.notes ?? null,
        status: 'PENDING',
        sentAt: new Date(),
        respondedAt: null,
      },
    });

    return NextResponse.json(feeEstimate, { status: 201 });
  } catch (e) {
    console.error('Failed to save fee estimate', e);
    const message = e instanceof Error ? e.message : 'Failed to save fee estimate';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/applications/[id]/fee-estimate
 * Record the applicant's response to a pending cost estimate.
 * body: { status: 'ACCEPTED' | 'REJECTED', actingUserId }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const auth = await requireRole(body.actingUserId, [...MANAGE_ROLES]);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (body.status !== 'ACCEPTED' && body.status !== 'REJECTED') {
      return NextResponse.json({ error: 'status must be ACCEPTED or REJECTED' }, { status: 422 });
    }

    const existing = await prisma.feeEstimate.findUnique({ where: { applicationId: id } });
    if (!existing) return NextResponse.json({ error: 'No fee estimate found' }, { status: 404 });

    const feeEstimate = await prisma.feeEstimate.update({
      where: { applicationId: id },
      data: { status: body.status, respondedAt: new Date() },
    });

    return NextResponse.json(feeEstimate);
  } catch (e) {
    console.error('Failed to update fee estimate', e);
    const message = e instanceof Error ? e.message : 'Failed to update fee estimate';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
