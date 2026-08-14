import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { AppealStatus } from '@prisma/client';
import { requireRole } from '@/lib/authz';
import { signAppealDecision } from '@/lib/permit-signing';
import { generateAppealDecisionPdf } from '@/lib/generate-appeal-decision-pdf';

const TERMINAL_STATUSES: AppealStatus[] = ['UPHELD', 'REJECTED', 'WITHDRAWN'];
// UPHELD/REJECTED are decisions on the merits and get a formal signed
// document (R10.0.6); WITHDRAWN isn't a decision, so it stays unsigned.
const DECIDED_STATUSES: AppealStatus[] = ['UPHELD', 'REJECTED'];

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

    const appeal = await prisma.appeal.findUnique({
      where: { id },
      include: { application: { select: { referenceNumber: true, title: true } } },
    });
    if (!appeal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const status = body.status as AppealStatus;
    if (!['SUBMITTED', 'UNDER_REVIEW', 'UPHELD', 'REJECTED', 'WITHDRAWN'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 422 });
    }

    const decisionAt = TERMINAL_STATUSES.includes(status) ? new Date() : appeal.decisionAt;
    const decisionSummary = body.decisionSummary ?? appeal.decisionSummary;

    let signed: { signature: string; signedAt: Date; signingKeyId: string } | null = null;
    let pdf: Buffer | null = null;
    if (DECIDED_STATUSES.includes(status) && decisionAt) {
      signed = await signAppealDecision({ appealId: id, applicationId: appeal.applicationId, status, decisionAt });
      const bytes = await generateAppealDecisionPdf({
        appealId: id,
        status,
        submittedBy: appeal.submittedBy,
        grounds: appeal.grounds,
        authority: appeal.authority,
        decisionAt,
        decisionSummary,
        application: appeal.application,
        signature: signed.signature,
        signedAt: signed.signedAt,
        signingKeyId: signed.signingKeyId,
      });
      pdf = Buffer.from(bytes);
    }

    const updated = await prisma.appeal.update({
      where: { id },
      data: {
        status,
        decisionSummary,
        decisionAt,
        ...(signed ? { signature: signed.signature, signedAt: signed.signedAt, signingKeyId: signed.signingKeyId } : {}),
        ...(pdf ? { pdf } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        entityType: 'Appeal',
        entityId: id,
        action: `Appeal decided: ${status}`,
        comment: body.decisionSummary ?? null,
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error('Failed to update appeal', e);
    const message = e instanceof Error ? e.message : 'Failed to update appeal';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
