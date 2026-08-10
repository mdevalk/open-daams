import { NextRequest, NextResponse } from 'next/server';
import { Prisma, Application, ApplicationStatus, DecisionOutcome } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  getAvailableTransitions,
  calculateDecisionDeadline,
  calculateAdditionalInfoDeadline,
  calculatePermitAcceptanceDeadline,
  TRANSITIONS,
} from '@/lib/workflow';
import { signDecisionCard } from '@/lib/permit-signing';
import { generateDecisionPdf } from '@/lib/generate-decision-pdf';
import { findActingUser } from '@/lib/authz';

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

/**
 * Computes the field updates a transition to toStatus implies — deadline
 * bookkeeping (D6.4 §8) plus, for DECISION_ISSUED, the decision-outcome
 * fields themselves (the decision document/PDF is handled separately by
 * issueDecision, since it needs its own id-collision retry loop).
 */
function computeStatusUpdates(
  toStatus: ApplicationStatus,
  application: Application,
  comment: string | undefined,
  decisionOutcome: DecisionOutcome | undefined,
  now: Date,
): Record<string, unknown> {
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
    updates.decisionOutcome = decisionOutcome;
    updates.decisionAt = now;
    updates.decisionSummary = comment ?? null;
    updates.additionalInfoDeadline = null;
    // Art. 58 / 61(4): decisions/refusals published within 30 working days
    updates.decisionPublishedAt = now;

    if (decisionOutcome === 'NEGATIVE') {
      updates.negativeDecisionSentAt = now;
    } else {
      // D6.4 §9.2: positive decision → unsigned pre-permit, applicant has
      // 28 days to accept before the real permit can be issued.
      updates.permitConditionsSentAt = now;
      updates.permitAcceptanceDeadline = calculatePermitAcceptanceDeadline(now);
      updates.permitAcceptanceStatus = 'PENDING';
    }
  }

  return updates;
}

/**
 * Generates the decision-card PDF (+ signature for a negative outcome),
 * commits it alongside the status update and audit log entry, and retries
 * on a decisionId collision (see generateDecisionId's doc comment).
 */
async function issueDecision(
  id: string,
  application: Application,
  updates: Record<string, unknown>,
  toStatus: ApplicationStatus,
  transitionLabel: string,
  comment: string | undefined,
  actingUserId: string,
  now: Date,
) {
  const outcome = updates.decisionOutcome as DecisionOutcome;

  const applicationForPdfRaw = await prisma.application.findUniqueOrThrow({
    where: { id },
    select: {
      referenceNumber: true,
      title: true,
      type: true,
      legalBasis: true,
      applicant: { select: { name: true, email: true, dataUser: { select: { name: true } } } },
    },
  });
  // generateDecisionPdf expects a plain applicant.organisation string —
  // resolve it from the dataUser relation here rather than changing that
  // function.
  const applicationForPdf = {
    ...applicationForPdfRaw,
    applicant: {
      name: applicationForPdfRaw.applicant.name,
      email: applicationForPdfRaw.applicant.email,
      organisation: applicationForPdfRaw.applicant.dataUser?.name ?? 'Unknown',
    },
  };

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
      decisionSummary: comment ?? null,
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
        prisma.applicationLog.create({
          data: {
            applicationId: id,
            userId: actingUserId,
            fromStatus: application.status,
            toStatus,
            action: transitionLabel,
            comment: comment ?? null,
          },
        }),
      ]);
      return updated;
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

/** The non-DECISION_ISSUED path: a plain status update + audit log entry. */
async function recordTransition(
  id: string,
  application: Application,
  toStatus: ApplicationStatus,
  transitionLabel: string,
  updates: Record<string, unknown>,
  comment: string | undefined,
  actingUserId: string,
) {
  const [updated] = await prisma.$transaction([
    prisma.application.update({ where: { id }, data: updates }),
    prisma.applicationLog.create({
      data: {
        applicationId: id,
        userId: actingUserId,
        fromStatus: application.status,
        toStatus,
        action: transitionLabel,
        comment: comment ?? null,
      },
    }),
  ]);
  return updated;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    // body: { toStatus, actingUserId, comment, decisionOutcome? }

    const application = await prisma.application.findUnique({ where: { id }, include: { feeEstimate: true } });
    if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const found = await findActingUser(body.actingUserId);
    if (!found.ok) return NextResponse.json({ error: found.error }, { status: found.status });

    const feeEstimateAccepted = application.feeEstimate?.status === 'ACCEPTED';
    const available = getAvailableTransitions(application.status, application.type, found.user.role, feeEstimateAccepted);
    const transition = available.find(
      (t) =>
        t.to === body.toStatus &&
        (!t.requiresDecisionOutcome || t.requiresDecisionOutcome === body.decisionOutcome),
    );

    if (!transition) {
      // A positive decision is blocked by the fee-estimate gate specifically
      // (not role/status) — give an accurate reason rather than the generic
      // "not allowed for role X" message below.
      const wouldMatchWithoutFeeGate = (TRANSITIONS[application.status] ?? []).find(
        (t) =>
          t.to === body.toStatus &&
          t.requiredRole.includes(found.user.role) &&
          (!t.requiresDecisionOutcome || t.requiresDecisionOutcome === body.decisionOutcome),
      );
      if (wouldMatchWithoutFeeGate?.requiresFeeEstimateAccepted && !feeEstimateAccepted) {
        return NextResponse.json(
          { error: 'A positive decision requires an accepted fee estimate first.' },
          { status: 422 },
        );
      }
      return NextResponse.json(
        { error: `Transition to ${body.toStatus} not allowed from ${application.status} for role ${found.user.role}` },
        { status: 422 },
      );
    }

    const now = new Date();
    const toStatus = body.toStatus as ApplicationStatus;
    const updates = computeStatusUpdates(toStatus, application, body.comment, body.decisionOutcome, now);

    const updated =
      toStatus === 'DECISION_ISSUED'
        ? await issueDecision(id, application, updates, toStatus, transition.label, body.comment, found.user.id, now)
        : await recordTransition(id, application, toStatus, transition.label, updates, body.comment, found.user.id);

    return NextResponse.json(updated);
  } catch (e) {
    console.error('Failed to transition application', e);
    const message = e instanceof Error ? e.message : 'Failed to transition application';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
