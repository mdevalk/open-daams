import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { signPermit } from '@/lib/permit-signing';
import { regenerateStoredPermitPdf } from '@/lib/permit-pdf-store';

/**
 * Derives the next sequential base permit number for the given year from the
 * highest existing number matching that year's prefix, rather than
 * prisma.dataPermit.count() — count() drifts from the true max sequence
 * whenever permits from other years exist, rows were deleted, or (now) a
 * permit has multiple versions sharing one base number, which caused unique
 * constraint violations on permitNumber. The base number is stable across an
 * application's permit versions; versioning is tracked by the `version` field.
 */
async function generatePermitNumber(year: number): Promise<string> {
  const prefix = `DP-NL-${year}-`;
  const last = await prisma.dataPermit.findFirst({
    where: { permitNumber: { startsWith: prefix } },
    orderBy: { permitNumber: 'desc' },
  });
  const lastSeq = last ? parseInt(last.permitNumber.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(lastSeq + 1).padStart(4, '0')}`;
}

function toDecimalOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * POST /api/permits
 * Issue a new data permit after a positive DECISION_ISSUED.
 * Implements D6.4 §9 / §9.1 (after optional permit-pending-acceptance step).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // body: { applicationId, validFrom, validUntil, issuedByUserId }

    const auth = await requireRole(body.issuedByUserId, ['DECISION_MAKER', 'ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const application = await prisma.application.findUnique({
      where: { id: body.applicationId },
      include: { dataPermits: { select: { id: true } } },
    });

    if (!application)
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    if (application.decisionOutcome !== 'POSITIVE')
      return NextResponse.json({ error: 'Permit can only be issued for a positive decision' }, { status: 422 });
    if (application.dataPermits.length > 0)
      return NextResponse.json({ error: 'A permit has already been issued for this application' }, { status: 409 });

    const year = new Date().getFullYear();
    const issuedAt = new Date();
    const validFrom = new Date(body.validFrom);
    const validUntil = new Date(body.validUntil);

    let permit;
    const MAX_ATTEMPTS = 5;
    for (let attempt = 1; ; attempt++) {
      const permitNumber = await generatePermitNumber(year);
      const { signature, signedAt, signingKeyId } = await signPermit({
        permitNumber,
        version: 1,
        applicationId: body.applicationId,
        issuedAt,
        validFrom,
        validUntil,
      });
      try {
        permit = await prisma.dataPermit.create({
          data: {
            permitNumber,
            applicationId: body.applicationId,
            status: 'GRANTED',
            issuedAt,
            validFrom,
            validUntil,
            signature,
            signedAt,
            signingKeyId,
            permitProcessingFee: toDecimalOrNull(body.permitProcessingFee),
            dataPreparationFee: toDecimalOrNull(body.dataPreparationFee),
            speSetupFee: toDecimalOrNull(body.speSetupFee),
            speUsageFee: toDecimalOrNull(body.speUsageFee),
            additionalServicesFee: toDecimalOrNull(body.additionalServicesFee),
            dataHolderFee: toDecimalOrNull(body.dataHolderFee),
            paymentTerms: body.paymentTerms || null,
          },
        });
        break;
      } catch (e) {
        const isUniqueClash =
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002' &&
          (e.meta?.target as string[] | undefined)?.includes('permitNumber');
        if (isUniqueClash && attempt < MAX_ATTEMPTS) continue;
        throw e;
      }
    }

    await prisma.dataPermitLog.create({
      data: {
        permitId: permit.id,
        userId: body.issuedByUserId,
        toStatus: 'GRANTED',
        action: 'Permit issued',
      },
    });

    await regenerateStoredPermitPdf(permit.id, prisma);

    return NextResponse.json(permit, { status: 201 });
  } catch (e) {
    console.error('Failed to issue permit', e);
    const message = e instanceof Error ? e.message : 'Failed to issue permit';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
