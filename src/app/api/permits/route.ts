import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

/**
 * Derives the next sequential permit number for the given year from the
 * highest existing number matching that year's prefix, rather than
 * prisma.dataPermit.count() — count() drifts from the true max sequence
 * whenever permits from other years exist, rows were deleted, or a
 * renewal/amendment (see lib/permit.ts nextPermitNumber) already bumped a
 * number past what count() reflects, which caused unique constraint
 * violations on permitNumber.
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

/**
 * POST /api/permits
 * Issue a new data permit after a positive DECISION_ISSUED.
 * Implements D6.4 §9 / §9.1 (after optional permit-pending-acceptance step).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // body: { applicationId, validFrom, validUntil, issuedByUserId }

    const application = await prisma.application.findUnique({
      where: { id: body.applicationId },
      include: { dataPermit: true },
    });

    if (!application)
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    if (application.decisionOutcome !== 'POSITIVE')
      return NextResponse.json({ error: 'Permit can only be issued for a positive decision' }, { status: 422 });
    if (application.dataPermit)
      return NextResponse.json({ error: 'A permit has already been issued for this application' }, { status: 409 });

    const year = new Date().getFullYear();

    let permit;
    const MAX_ATTEMPTS = 5;
    for (let attempt = 1; ; attempt++) {
      const permitNumber = await generatePermitNumber(year);
      try {
        permit = await prisma.dataPermit.create({
          data: {
            permitNumber,
            applicationId: body.applicationId,
            status: 'GRANTED',
            validFrom: new Date(body.validFrom),
            validUntil: new Date(body.validUntil),
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

    return NextResponse.json(permit, { status: 201 });
  } catch (e) {
    console.error('Failed to issue permit', e);
    const message = e instanceof Error ? e.message : 'Failed to issue permit';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
