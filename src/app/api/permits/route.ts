import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { signPermit, groupDatasetsByHolder } from '@/lib/permit-signing';
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

/**
 * POST /api/permits
 * Issue a new data permit after a positive DECISION_ISSUED.
 * Implements D6.4 §9 / §9.1 (after optional permit-pending-acceptance step).
 * The permit's cost line items and SPE operator/type are not accepted from
 * the client — they're derived from the application's accepted FeeEstimate,
 * which is the sole source of financial terms (D6.4 §9: no re-entry at
 * issuance).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // body: { applicationId, validFrom, validUntil, issuedByUserId }

    const auth = await requireRole(body.issuedByUserId, ['DECISION_MAKER', 'ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const application = await prisma.application.findUnique({
      where: { id: body.applicationId },
      include: {
        dataPermits: { select: { id: true } },
        requestedDatasets: {
          include: { dataHolder: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        },
        feeEstimate: { include: { lineItems: true } },
      },
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
    // Reshape to the flat {dataHolderName,name,url} shape groupDatasetsByHolder
    // expects — keeps signPermit()'s input byte-for-byte identical regardless
    // of the dataHolder relation added alongside the frozen dataHolderName.
    const grantedDatasets = groupDatasetsByHolder(
      application.requestedDatasets.map((rd) => ({
        dataHolderName: rd.dataHolder?.name ?? 'Unknown',
        name: rd.name,
        url: rd.url,
        datasetId: rd.datasetId,
        catalogId: rd.catalogId,
        distributions: rd.distributions,
      })),
    );

    const speOperatorId = application.feeEstimate?.speOperatorId ?? null;
    const speTypeId = application.feeEstimate?.speTypeId ?? null;
    const estimateLineItems = application.feeEstimate?.lineItems ?? [];
    const totalAmount = estimateLineItems.reduce((sum, item) => sum + Number(item.amount), 0);

    // Resolved once here and frozen into both the signature and the permit
    // row itself (speOperatorName/etc.) — see the schema comment on those
    // columns for why this can't just be a live join at verify time.
    const [speOperatorRow, speTypeRow] = await Promise.all([
      speOperatorId
        ? prisma.speOperator.findUnique({
            where: { id: speOperatorId },
            include: { speProvider: { select: { name: true } } },
          })
        : null,
      speTypeId
        ? prisma.speType.findUnique({ where: { id: speTypeId } })
        : null,
    ]);
    const speType = speTypeRow && { id: speTypeRow.id, name: speTypeRow.name };
    const speOperator = speOperatorRow && {
      id: speOperatorRow.id,
      name: speOperatorRow.name,
      providerName: speOperatorRow.speProvider?.name ?? null,
      type: speType || null,
    };

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
        grantedDatasets,
        speOperator: speOperator || null,
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
            totalAmount: estimateLineItems.length > 0 ? totalAmount : null,
            lineItems: {
              create: estimateLineItems.map((item) => ({
                category: item.category,
                glCode: item.glCode,
                description: item.description,
                amount: item.amount,
                currency: item.currency,
              })),
            },
            speOperatorId,
            speTypeId,
            speOperatorName: speOperator ? speOperator.name : null,
            speOperatorProviderName: speOperator ? speOperator.providerName : null,
            speTypeName: speType ? speType.name : null,
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

    if (application.requestedDatasets.length > 0) {
      await prisma.grantedDataset.createMany({
        data: application.requestedDatasets.map((rd) => ({
          permitId: permit.id,
          // Frozen at issuance — never re-derived from the registry later.
          dataHolderName: rd.dataHolder?.name ?? 'Unknown',
          dataHolderId: rd.dataHolderId,
          name: rd.name,
          url: rd.url,
          datasetId: rd.datasetId,
          catalogId: rd.catalogId,
          distributions: rd.distributions ?? undefined,
        })),
      });
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
