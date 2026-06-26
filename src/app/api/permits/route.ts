import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * POST /api/permits
 * Issue a new data permit after a positive DECISION_ISSUED.
 * Implements D6.4 §9 / §9.1 (after optional permit-pending-acceptance step).
 */
export async function POST(req: NextRequest) {
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

  const count = await prisma.dataPermit.count();
  const permitNumber = `DP-NL-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

  const permit = await prisma.dataPermit.create({
    data: {
      permitNumber,
      applicationId: body.applicationId,
      status: 'GRANTED',
      validFrom: new Date(body.validFrom),
      validUntil: new Date(body.validUntil),
    },
  });

  await prisma.dataPermitLog.create({
    data: {
      permitId: permit.id,
      userId: body.issuedByUserId,
      toStatus: 'GRANTED',
      action: 'Permit issued',
    },
  });

  return NextResponse.json(permit, { status: 201 });
}
