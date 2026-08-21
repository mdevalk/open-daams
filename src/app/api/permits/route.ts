import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { signPermit, groupDatasetsByHolder, type GrantedDatasetGroup } from '@/lib/permit-signing';
import { regenerateStoredPermitPdf } from '@/lib/permit-pdf-store';
import { generateSampleDid } from '@/lib/did';

// urn:objectstore:bucket:<slug> — lowercase, non-alphanumerics collapsed to
// single hyphens, trimmed.
function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'dataset';
}

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

type ApplicationWithRelations = Prisma.ApplicationGetPayload<{
  include: {
    dataPermits: { select: { id: true } };
    requestedDatasets: { include: { dataHolder: { select: { name: true } } } };
    feeEstimate: { include: { lineItems: true } };
  };
}>;

type RequestedDatasetRow = ApplicationWithRelations['requestedDatasets'][number];

type StorageLocationsByDataset = Map<string, { reference: string; writerDid: string }>;

type ResearcherInfo = { name: string; affiliation: string; did: string };

type OutputControllerInfo = { name: string; affiliation: string; did: string };

/**
 * One storage location per requested dataset, generated once here so the
 * exact reference/writerDid signed afterward (via grantedDatasets) is what
 * actually gets persisted (see persistGrantedDatasetsAndAuthorizedPersons) —
 * not regenerated and potentially drifting from the signature.
 */
export function buildStorageLocations(requestedDatasets: RequestedDatasetRow[]): StorageLocationsByDataset {
  return new Map(
    requestedDatasets.map((rd) => [
      rd.id,
      {
        reference: `urn:objectstore:bucket:${slugify(rd.dataHolder?.name ?? 'holder')}-${slugify(rd.name)}-${rd.id.slice(-8)}`,
        writerDid: generateSampleDid(),
      },
    ]),
  );
}

/**
 * The researcher — sourced from the application's own Section 5 fields,
 * mirroring the form's own alternation between "person responsible for
 * the research" and "person responsible for data use."
 */
export function resolveResearcher(application: ApplicationWithRelations): ResearcherInfo | null {
  const researcherName = application.personResearchName ?? application.personResponsibleName;
  const researcherAffiliation = application.personResearchAffiliation ?? application.personResponsibleAffiliation;
  return researcherName
    ? {
        name: researcherName,
        affiliation: researcherAffiliation ?? '',
        did: generateSampleDid(),
      }
    : null;
}

/**
 * Resolved once here and frozen into both the signature and the permit row
 * itself (speOperatorName/etc.) — see the schema comment on those columns
 * for why this can't just be a live join at verify time.
 */
export async function resolveSpeSelection(feeEstimate: ApplicationWithRelations['feeEstimate']) {
  const speOperatorId = feeEstimate?.speOperatorId ?? null;
  const speTypeId = feeEstimate?.speTypeId ?? null;
  const estimateLineItems = feeEstimate?.lineItems ?? [];
  const totalAmount = estimateLineItems.reduce((sum, item) => sum + Number(item.amount), 0);

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

  return { speOperatorId, speTypeId, speOperator, speType, estimateLineItems, totalAmount };
}

type SpeSelection = Awaited<ReturnType<typeof resolveSpeSelection>>;

/**
 * Generates the next permit number and signs + persists the permit, retrying
 * on a permitNumber unique-constraint collision (another issuance racing for
 * the same sequence number) up to MAX_ATTEMPTS times.
 */
/** The prisma.dataPermit.create() `data` payload, given an already-generated permitNumber and signature. */
function buildPermitCreateData(
  permitNumber: string,
  application: ApplicationWithRelations,
  params: { issuedAt: Date; validFrom: Date; validUntil: Date },
  signature: { signature: string; signedAt: Date; signingKeyId: string },
  speSelection: SpeSelection,
) {
  return {
    permitNumber,
    applicationId: application.id,
    status: 'GRANTED' as const,
    issuedAt: params.issuedAt,
    validFrom: params.validFrom,
    validUntil: params.validUntil,
    signature: signature.signature,
    signedAt: signature.signedAt,
    signingKeyId: signature.signingKeyId,
    totalAmount: speSelection.estimateLineItems.length > 0 ? speSelection.totalAmount : null,
    lineItems: {
      create: speSelection.estimateLineItems.map((item) => ({
        category: item.category,
        glCode: item.glCode,
        description: item.description,
        amount: item.amount,
        currency: item.currency,
        applicationId: application.id,
        dataHolderId: item.dataHolderId,
      })),
    },
    speOperatorId: speSelection.speOperatorId,
    speTypeId: speSelection.speTypeId,
    speOperatorName: speSelection.speOperator ? speSelection.speOperator.name : null,
    speOperatorProviderName: speSelection.speOperator ? speSelection.speOperator.providerName : null,
    speTypeName: speSelection.speType ? speSelection.speType.name : null,
    // Frozen at issuance (D6.4 R7.3.2/R7.4.2) — see the schema comment.
    purposeCategory: application.purposeCategory,
    purposeCategories: application.purposeCategories,
    electronicHealthDataFormat: application.electronicHealthDataFormat,
  };
}

async function createPermitWithRetry(params: {
  application: ApplicationWithRelations;
  year: number;
  issuedAt: Date;
  validFrom: Date;
  validUntil: Date;
  grantedDatasets: GrantedDatasetGroup[];
  speSelection: SpeSelection;
  researcher: ResearcherInfo | null;
  outputController: OutputControllerInfo;
}) {
  const { application, speSelection } = params;
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; ; attempt++) {
    const permitNumber = await generatePermitNumber(params.year);
    const signature = await signPermit({
      permitNumber,
      version: 1,
      applicationId: application.id,
      issuedAt: params.issuedAt,
      validFrom: params.validFrom,
      validUntil: params.validUntil,
      grantedDatasets: params.grantedDatasets,
      speOperator: speSelection.speOperator || null,
      // Name/email stay in the AuthorizedPerson DB row only (below) — the
      // signed/printed permit itself carries just organisation + identity.
      researcher: params.researcher ? { affiliation: params.researcher.affiliation, did: params.researcher.did } : null,
      outputController: { affiliation: params.outputController.affiliation, did: params.outputController.did },
    });
    try {
      return await prisma.dataPermit.create({
        data: buildPermitCreateData(permitNumber, application, params, signature, speSelection),
      });
    } catch (e) {
      const isUniqueClash =
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        (e.meta?.target as string[] | undefined)?.includes('permitNumber');
      if (isUniqueClash && attempt < MAX_ATTEMPTS) continue;
      throw e;
    }
  }
}

/**
 * Individual creates (not createMany) so each GrantedDataset can nest its own
 * StorageLocation — the same reference/writerDid already signed above.
 */
async function persistGrantedDatasetsAndAuthorizedPersons(
  permit: { id: string },
  application: ApplicationWithRelations,
  storageLocationsByDataset: StorageLocationsByDataset,
  researcher: ResearcherInfo | null,
  outputController: OutputControllerInfo,
  issuedByUserId: string,
) {
  for (const rd of application.requestedDatasets) {
    const storageLocation = storageLocationsByDataset.get(rd.id);
    await prisma.grantedDataset.create({
      data: {
        permitId: permit.id,
        // Frozen at issuance — never re-derived from the registry later.
        dataHolderName: rd.dataHolder?.name ?? 'Unknown',
        dataHolderId: rd.dataHolderId,
        name: rd.name,
        url: rd.url,
        datasetId: rd.datasetId,
        catalogId: rd.catalogId,
        distributions: rd.distributions ?? undefined,
        ...(storageLocation
          ? {
              storageLocation: {
                create: {
                  reference: storageLocation.reference,
                  writerDid: storageLocation.writerDid,
                  authorizedById: issuedByUserId,
                },
              },
            }
          : {}),
      },
    });
  }

  await prisma.authorizedPerson.createMany({
    data: [
      ...(researcher
        ? [{ permitId: permit.id, name: researcher.name, affiliation: researcher.affiliation, role: 'RESEARCHER' as const, did: researcher.did }]
        : []),
      {
        permitId: permit.id,
        name: outputController.name,
        affiliation: outputController.affiliation,
        role: 'OUTPUT_CONTROLLER' as const,
        did: outputController.did,
      },
    ],
  });
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

    if (!body.outputControllerName || !body.outputControllerAffiliation) {
      return NextResponse.json(
        { error: 'Output controller name and affiliation are required to issue a permit' },
        { status: 422 },
      );
    }

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

    const storageLocationsByDataset = buildStorageLocations(application.requestedDatasets);

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
        storageLocation: storageLocationsByDataset.get(rd.id) ?? null,
      })),
    );

    const researcher = resolveResearcher(application);

    // Selected by HDAB at the moment of issuance — can be HDAB staff, a data
    // holder's employee, or an external expert, so this is always
    // freshly-entered on the issuance form, never derived from a User.
    // Affiliation is UI-constrained to existing data holders for now.
    const outputController = {
      name: String(body.outputControllerName).trim(),
      affiliation: String(body.outputControllerAffiliation).trim(),
      did: generateSampleDid(),
    };

    const speSelection = await resolveSpeSelection(application.feeEstimate);

    const permit = await createPermitWithRetry({
      application,
      year,
      issuedAt,
      validFrom,
      validUntil,
      grantedDatasets,
      speSelection,
      researcher,
      outputController,
    });

    await persistGrantedDatasetsAndAuthorizedPersons(
      permit,
      application,
      storageLocationsByDataset,
      researcher,
      outputController,
      body.issuedByUserId,
    );

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
