import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  getAvailableTransitions,
  calculateDecisionDeadline,
  calculateAdditionalInfoDeadline,
  calculatePermitAcceptanceDeadline,
} from '@/lib/workflow';
import { ApplicationStatus, DecisionOutcome } from '@prisma/client';
import { signDecisionCard } from '@/lib/permit-signing';
import { generateDecisionPdf } from '@/lib/generate-decision-pdf';

/**
 * Derives the next sequential decision id for the given year from the
 * highest existing id matching that year's prefix, mirroring
 * generatePermitNumber in src/app/api/permits/route.ts (same rationale:
 * count() drifts from the true max sequence whenever rows are missing).
 */
async function generateDecisionId(year: number): Promise<string> {
  const prefix = `DEC-NL-${year}-`;
  const last = await prisma.application.findFirst({
    where: { decisionId: { startsWith: prefix } },
    orderBy: { decisionId: 'desc' },
  });
  const lastSeq = last ? parseInt(last.decisionId!.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(lastSeq + 1).padStart(4, '0')}`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    // body: { toStatus, userId, comment, decisionOutcome? }

    const application = await prisma.application.findUnique({ where: { id } });
    if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const user = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 400 });

    const available = getAvailableTransitions(application.status, application.type, user.role);
    const transition = available.find(
      (t) =>
        t.to === body.toStatus &&
        (!t.requiresDecisionOutcome || t.requiresDecisionOutcome === body.decisionOutcome),
    );

    if (!transition) {
      return NextResponse.json(
        { error: `Transition to ${body.toStatus} not allowed from ${application.status} for role ${user.role}` },
        { status: 422 },
      );
    }

    const now = new Date();
    const toStatus = body.toStatus as ApplicationStatus;
    const updates: Record<string, unknown> = { status: toStatus };

    if (toStatus === 'SUBMITTED') {
      updates.submittedAt = now;
      updates.decisionDeadline = calculateDecisionDeadline(now, application.decisionTrack);
      // Art. 57(1)(j)(ii): publish without undue delay after initial reception
      updates.publishedAt = now;
    }

    if (toStatus === 'AWAITING_ADDITIONAL_INFORMATION') {
      // D6.4 §8: void the decision deadline while awaiting additional information
      updates.decisionDeadline = null;
      updates.additionalInfoDeadline = calculateAdditionalInfoDeadline(now);
    }

    if (toStatus === 'PRE_SCREENING' && application.status === 'AWAITING_ADDITIONAL_INFORMATION') {
      // D6.4 §8: recalculate decision deadline from timestamp of additional info receipt
      updates.additionalInfoDeadline = null;
      updates.additionalInfoReceivedAt = now;
      updates.decisionDeadline = calculateDecisionDeadline(now, application.decisionTrack, application.deadlineExtended);
    }

    if (toStatus === 'DECISION_ISSUED') {
      const outcome = body.decisionOutcome as DecisionOutcome;
      updates.decisionOutcome = outcome;
      updates.decisionAt = now;
      updates.decisionSummary = body.comment ?? null;
      updates.additionalInfoDeadline = null;
      // Art. 58 / 61(4): decisions/refusals published within 30 working days
      updates.decisionPublishedAt = now;

      if (outcome === 'NEGATIVE') {
        updates.negativeDecisionSentAt = now;
      } else {
        // D6.4 §9.2: positive decision → unsigned pre-permit, applicant has
        // 28 days to accept before the real permit can be issued.
        updates.permitConditionsSentAt = now;
        updates.permitAcceptanceDeadline = calculatePermitAcceptanceDeadline(now);
        updates.permitAcceptanceStatus = 'PENDING';
      }

      const applicationForPdf = await prisma.application.findUniqueOrThrow({
        where: { id },
        select: {
          referenceNumber: true,
          title: true,
          type: true,
          legalBasis: true,
          applicant: { select: { name: true, organisation: true, email: true } },
        },
      });

      const MAX_ATTEMPTS = 5;
      for (let attempt = 1; ; attempt++) {
        const decisionId = await generateDecisionId(now.getFullYear());

        const signed =
          outcome === 'NEGATIVE'
            ? await signDecisionCard({ decisionId, applicationId: id, decisionOutcome: outcome, decisionAt: now })
            : null;

        const pdf = await generateDecisionPdf({
          decisionId,
          decisionOutcome: outcome,
          decisionAt: now,
          decisionSummary: body.comment ?? null,
          legalBasis: applicationForPdf.legalBasis,
          application: applicationForPdf,
          decisionCardSignature: signed?.signature ?? null,
          decisionCardSignedAt: signed?.signedAt ?? null,
          decisionCardSigningKeyId: signed?.signingKeyId ?? null,
        });

        const attemptUpdates = {
          ...updates,
          decisionId,
          decisionCardPdf: Buffer.from(pdf),
          ...(signed
            ? {
                decisionCardSignature: signed.signature,
                decisionCardSignedAt: signed.signedAt,
                decisionCardSigningKeyId: signed.signingKeyId,
              }
            : {}),
        };

        try {
          const [updated] = await prisma.$transaction([
            prisma.application.update({ where: { id }, data: attemptUpdates }),
            prisma.auditLog.create({
              data: {
                applicationId: id,
                userId: body.userId,
                fromStatus: application.status,
                toStatus,
                action: transition.label,
                comment: body.comment ?? null,
              },
            }),
          ]);
          return NextResponse.json(updated);
        } catch (e) {
          const isUniqueClash =
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === 'P2002' &&
            (e.meta?.target as string[] | undefined)?.includes('decisionId');
          if (isUniqueClash && attempt < MAX_ATTEMPTS) continue;
          throw e;
        }
      }
    }

    const [updated] = await prisma.$transaction([
      prisma.application.update({ where: { id }, data: updates }),
      prisma.auditLog.create({
        data: {
          applicationId: id,
          userId: body.userId,
          fromStatus: application.status,
          toStatus,
          action: transition.label,
          comment: body.comment ?? null,
        },
      }),
    ]);

    return NextResponse.json(updated);
  } catch (e) {
    console.error('Failed to transition application', e);
    const message = e instanceof Error ? e.message : 'Failed to transition application';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
