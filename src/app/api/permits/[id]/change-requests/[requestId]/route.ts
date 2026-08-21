import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { DECIDE_ROLES, APPROVAL_EFFECT } from '@/lib/permit-change';
import { signPermit, groupDatasetsByHolder } from '@/lib/permit-signing';
import { regenerateStoredPermitPdf } from '@/lib/permit-pdf-store';
import { generateSampleDid } from '@/lib/did';

const CHANGE_REQUEST_INCLUDE = {
  permit: {
    include: {
      authorizedPersons: true,
      speProvisioning: true,
      grantedDatasets: { include: { storageLocation: true } },
      lineItems: true,
    },
  },
} satisfies Prisma.PermitChangeRequestInclude;

type ChangeRequestWithPermit = Prisma.PermitChangeRequestGetPayload<{ include: typeof CHANGE_REQUEST_INCLUDE }>;
type PermitWithRelations = ChangeRequestWithPermit['permit'];
type ApprovalEffect = (typeof APPROVAL_EFFECT)[keyof typeof APPROVAL_EFFECT];

/** Rejects a change request — the permit itself is left unchanged. */
async function rejectChangeRequest(
  requestId: string,
  actingUserId: string,
  comment: string | null | undefined,
  now: Date,
) {
  return prisma.permitChangeRequest.update({
    where: { id: requestId },
    data: { status: 'REJECTED', decidedById: actingUserId, decidedAt: now, decisionComment: comment ?? null },
  });
}

/**
 * Resolves the SPE operator/type id to carry onto the new permit version —
 * requested explicitly for AMENDMENT, otherwise carried forward unchanged —
 * and, when the id changed, the frozen name snapshot that goes with it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveSpeFields(request: ChangeRequestWithPermit, permit: PermitWithRelations, body: any) {
  const speOperatorId =
    request.type === 'AMENDMENT' && 'speOperatorId' in body ? body.speOperatorId || null : permit.speOperatorId;
  const speTypeId =
    request.type === 'AMENDMENT' && 'speTypeId' in body ? body.speTypeId || null : permit.speTypeId;

  // Only re-resolve (and re-freeze) the name snapshot when the id actually
  // changes — carrying the id forward unchanged means the previous
  // version's frozen name is still correct, no lookup needed. See the
  // schema comment on speOperatorName/etc. for why this can't be a live
  // join at verify time.
  const speOperatorChanged = speOperatorId !== permit.speOperatorId;
  const speTypeChanged = speTypeId !== permit.speTypeId;
  const speOperatorRow = speOperatorChanged && speOperatorId
    ? await prisma.speOperator.findUnique({ where: { id: speOperatorId }, include: { speProvider: { select: { name: true } } } })
    : null;
  const speTypeRow = speTypeChanged && speTypeId
    ? await prisma.speType.findUnique({ where: { id: speTypeId } })
    : null;
  const speOperatorName = speOperatorChanged ? (speOperatorRow?.name ?? null) : permit.speOperatorName;
  const speOperatorProviderName = speOperatorChanged
    ? (speOperatorRow?.speProvider?.name ?? null)
    : permit.speOperatorProviderName;
  const speTypeName = speTypeChanged ? (speTypeRow?.name ?? null) : permit.speTypeName;

  return { speOperatorId, speTypeId, speOperatorName, speOperatorProviderName, speTypeName };
}

type OutputControllerResolution =
  | { ok: true; outputController: { name: string; affiliation: string; did: string } }
  | { ok: false; status: number; error: string };

/**
 * Resolves the output controller to carry onto the new permit version, and
 * validates a requested change. The output controller CAN be re-selected,
 * AMENDMENT-only, same "blank means unchanged" convention as speOperatorId
 * — both outputControllerName/Affiliation must be given together to change
 * it, and a fresh identity is generated when they are. Pure — no DB calls.
 */
export function resolveOutputController(
  request: ChangeRequestWithPermit,
  permit: PermitWithRelations,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any,
): OutputControllerResolution {
  const outputControllerRow = permit.authorizedPersons.find((p) => p.role === 'OUTPUT_CONTROLLER');
  if (!outputControllerRow?.did) {
    return { ok: false, status: 500, error: 'Permit has no output controller to carry forward' };
  }

  const outputControllerNameInput =
    request.type === 'AMENDMENT' && body.outputControllerName ? String(body.outputControllerName).trim() : '';
  const outputControllerAffiliationInput =
    request.type === 'AMENDMENT' && body.outputControllerAffiliation
      ? String(body.outputControllerAffiliation).trim()
      : '';
  if (Boolean(outputControllerNameInput) !== Boolean(outputControllerAffiliationInput)) {
    return {
      ok: false,
      status: 422,
      error: 'Both outputControllerName and outputControllerAffiliation are required to change the output controller',
    };
  }
  const outputControllerChanged = Boolean(outputControllerNameInput);
  const outputController = outputControllerChanged
    ? { name: outputControllerNameInput, affiliation: outputControllerAffiliationInput, did: generateSampleDid() }
    : { name: outputControllerRow.name, affiliation: outputControllerRow.affiliation, did: outputControllerRow.did };

  return { ok: true, outputController };
}

/**
 * R9.3.9: only AMENDMENT supports a delayed effective date; a blank or
 * today-or-past date takes the immediate path, same as before.
 */
export function resolveEffectiveDate(
  request: ChangeRequestWithPermit,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any,
  now: Date,
): { requestedEffectiveDate: Date | null; deferred: boolean } {
  const requestedEffectiveDate =
    request.type === 'AMENDMENT' && body.effectiveDate ? new Date(body.effectiveDate) : null;
  const deferred = requestedEffectiveDate !== null && requestedEffectiveDate.getTime() > now.getTime();
  return { requestedEffectiveDate, deferred };
}

// 1. Retire the current version — skipped when deferred: the old
//    version keeps operating until activation.
async function retireCurrentVersion(tx: Prisma.TransactionClient, permit: PermitWithRelations, deferred: boolean) {
  if (!deferred) {
    await tx.dataPermit.update({ where: { id: permit.id }, data: { isCurrent: false } });
  }
}

type NewPermitVersionOptions = {
  permit: PermitWithRelations;
  newVersion: number;
  deferred: boolean;
  requestedEffectiveDate: Date | null;
  effect: ApprovalEffect;
  newValidUntilResolved: Date;
  now: Date;
  signature: string;
  signedAt: Date;
  signingKeyId: string;
  speOperatorId: string | null;
  speTypeId: string | null;
  speOperatorName: string | null;
  speOperatorProviderName: string | null;
  speTypeName: string | null;
};

// 2. Create the new version, copying permit content forward. Revocation
//    markers are intentionally not carried over (a reinstated permit is clean).
async function createNewPermitVersion(tx: Prisma.TransactionClient, opts: NewPermitVersionOptions) {
  const {
    permit,
    newVersion,
    deferred,
    requestedEffectiveDate,
    effect,
    newValidUntilResolved,
    now,
    signature,
    signedAt,
    signingKeyId,
    speOperatorId,
    speTypeId,
    speOperatorName,
    speOperatorProviderName,
    speTypeName,
  } = opts;

  return tx.dataPermit.create({
    data: {
      permitNumber: permit.permitNumber, // stable base id
      version: newVersion,
      isCurrent: !deferred,
      effectiveAt: deferred ? requestedEffectiveDate : null,
      applicationId: permit.applicationId,
      status: effect.to,
      previousPermitId: permit.id,
      issuedAt: now,
      validFrom: permit.validFrom,
      validUntil: newValidUntilResolved,
      signature,
      signedAt,
      signingKeyId,
      currency: permit.currency,
      totalAmount: permit.totalAmount,
      lineItems: {
        create: permit.lineItems.map((item) => ({
          category: item.category,
          glCode: item.glCode,
          description: item.description,
          amount: item.amount,
          currency: item.currency,
          applicationId: permit.applicationId,
          dataHolderId: item.dataHolderId,
        })),
      },
      speOperatorId,
      speTypeId,
      speOperatorName,
      speOperatorProviderName,
      speTypeName,
      // Frozen at issuance (D6.4 R7.3.2/R7.4.2), carried forward unchanged.
      purposeCategory: permit.purposeCategory,
      purposeCategories: permit.purposeCategories,
      electronicHealthDataFormat: permit.electronicHealthDataFormat,
    },
  });
}

// 3. Carry the researcher forward unchanged (a fresh row per version,
//    like grantedDatasets below — same did, since it's the same
//    identity carried forward, not regenerated) and create the
//    output controller's row — either carried forward unchanged, or
//    the newly re-selected one from resolveOutputController above.
async function carryForwardAuthorizedPersons(
  tx: Prisma.TransactionClient,
  newPermit: { id: string },
  researcherRow: PermitWithRelations['authorizedPersons'][number] | undefined,
  newOutputController: { name: string; affiliation: string; did: string },
) {
  if (researcherRow?.did) {
    await tx.authorizedPerson.create({
      data: {
        permitId: newPermit.id,
        name: researcherRow.name,
        affiliation: researcherRow.affiliation,
        role: 'RESEARCHER',
        did: researcherRow.did,
      },
    });
  }
  await tx.authorizedPerson.create({
    data: {
      permitId: newPermit.id,
      name: newOutputController.name,
      affiliation: newOutputController.affiliation,
      role: 'OUTPUT_CONTROLLER',
      did: newOutputController.did,
    },
  });
}

// 3b. Carry the granted-datasets snapshot forward to the new version,
//     each with its own fresh StorageLocation row (grantedDatasetId is
//     unique per row, so the old StorageLocation can't be re-pointed) —
//     same reference/writerDid as before, carried forward unchanged.
async function carryForwardGrantedDatasets(
  tx: Prisma.TransactionClient,
  newPermit: { id: string },
  permit: PermitWithRelations,
  actingUserId: string,
) {
  for (const gd of permit.grantedDatasets) {
    await tx.grantedDataset.create({
      data: {
        permitId: newPermit.id,
        dataHolderName: gd.dataHolderName,
        dataHolderId: gd.dataHolderId,
        name: gd.name,
        url: gd.url,
        datasetId: gd.datasetId,
        catalogId: gd.catalogId,
        distributions: gd.distributions ?? undefined,
        ...(gd.storageLocation
          ? {
              storageLocation: {
                create: {
                  reference: gd.storageLocation.reference,
                  writerDid: gd.storageLocation.writerDid,
                  authorizedById: actingUserId,
                },
              },
            }
          : {}),
      },
    });
  }
}

// 4. Re-point the SPE provisioning order (one environment spans the
//    lifecycle) — skipped when deferred: reconfiguring the SPE is the
//    whole point of the transition period, so it stays on the old
//    version until activation.
async function repointSpeProvisioning(
  tx: Prisma.TransactionClient,
  permit: PermitWithRelations,
  newPermit: { id: string },
  deferred: boolean,
) {
  if (!deferred && permit.speProvisioning) {
    await tx.speProvisioningOrder.update({
      where: { permitId: permit.id },
      data: { permitId: newPermit.id },
    });
  }
}

// 5. Approve the request (stays on the version it was raised against).
async function approveChangeRequest(
  tx: Prisma.TransactionClient,
  requestId: string,
  actingUserId: string,
  now: Date,
  comment: string | null | undefined,
  newValidUntil: Date | undefined,
) {
  await tx.permitChangeRequest.update({
    where: { id: requestId },
    data: {
      status: 'APPROVED',
      decidedById: actingUserId,
      decidedAt: now,
      decisionComment: comment ?? null,
      newValidUntil: newValidUntil ?? null,
    },
  });
}

// 6. Log the transition on the new version.
async function logVersionTransition(
  tx: Prisma.TransactionClient,
  newPermit: { id: string },
  permit: PermitWithRelations,
  request: ChangeRequestWithPermit,
  effect: ApprovalEffect,
  deferred: boolean,
  comment: string | null | undefined,
  actingUserId: string,
) {
  await tx.dataPermitLog.create({
    data: {
      permitId: newPermit.id,
      userId: actingUserId,
      fromStatus: permit.status,
      toStatus: effect.to,
      action: deferred ? `${request.type} approved — pending activation` : `${request.type} approved`,
      comment: comment ?? null,
    },
  });
}

type ApprovalPreparation =
  | {
      ok: true;
      effect: ApprovalEffect;
      newValidUntil: Date | undefined;
      newValidUntilResolved: Date;
      requestedEffectiveDate: Date | null;
      deferred: boolean;
      newVersion: number;
      speOperatorId: string | null;
      speTypeId: string | null;
      speOperatorName: string | null;
      speOperatorProviderName: string | null;
      speTypeName: string | null;
      researcherRow: PermitWithRelations['authorizedPersons'][number] | undefined;
      newOutputController: { name: string; affiliation: string; did: string };
    }
  | { ok: false; status: number; error: string };

/**
 * Resolves and validates everything an APPROVED decision needs before
 * signing/persisting the new permit version — the RENEWAL validUntil
 * requirement, the deferred-effective-date calculation, the SPE fields, and
 * the output controller (including its own validation) — so `PATCH` itself
 * is just: call this, bail out on failure, otherwise proceed.
 */
async function prepareApproval(
  request: ChangeRequestWithPermit,
  permit: PermitWithRelations,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- body mirrors PATCH's untyped req.json() result
  body: any,
  now: Date,
): Promise<ApprovalPreparation> {
  const effect = APPROVAL_EFFECT[request.type];
  const newValidUntil =
    request.type === 'RENEWAL' && body.newValidUntil ? new Date(body.newValidUntil) : undefined;
  if (request.type === 'RENEWAL' && !newValidUntil) {
    return { ok: false, status: 422, error: 'A new validUntil date is required to approve a renewal' };
  }

  const { requestedEffectiveDate, deferred } = resolveEffectiveDate(request, body, now);

  const newVersion = permit.version + 1;
  const newValidUntilResolved = newValidUntil ?? permit.validUntil;

  const { speOperatorId, speTypeId, speOperatorName, speOperatorProviderName, speTypeName } =
    await resolveSpeFields(request, permit, body);

  // Researcher is never re-selected via amendment — it's derived from the
  // application, which doesn't change after decision — so it's always
  // carried forward unchanged.
  const researcherRow = permit.authorizedPersons.find((p) => p.role === 'RESEARCHER');

  const oc = resolveOutputController(request, permit, body);
  if (!oc.ok) return { ok: false, status: oc.status, error: oc.error };

  return {
    ok: true,
    effect, newValidUntil, newValidUntilResolved, requestedEffectiveDate, deferred, newVersion,
    speOperatorId, speTypeId, speOperatorName, speOperatorProviderName, speTypeName,
    researcherRow, newOutputController: oc.outputController,
  };
}

/**
 * PATCH /api/permits/[id]/change-requests/[requestId]
 * Approve or reject a change request. Approving issues a NEW permit version that
 * supersedes its predecessor (D6.4 §9.3 / R9.3.6): the old row is marked
 * isCurrent=false and a new row is created with version+1, linked via
 * previousPermitId. Rejecting leaves the permit unchanged.
 *
 * R9.3.9: an AMENDMENT approved with a strictly-future `effectiveDate` takes a
 * deferred path instead — the new version is created but stays isCurrent=false
 * (with effectiveAt set) and the old version keeps operating until a staff
 * member activates it via POST /api/permits/[id]/activate once the date is
 * due. Renewals and revocation appeals always stay immediate, per spec.
 * body: { decision: 'APPROVED' | 'REJECTED', actingUserId, comment?, newValidUntil?, effectiveDate?,
 *         speOperatorId?, speTypeId?, outputControllerName?, outputControllerAffiliation? }
 *
 * speOperatorId/speTypeId carry forward from the current version
 * onto the new one by default (same as the fee fields) — pass them
 * explicitly (a real id, or ''/null to clear) only to change them, which is
 * only meaningful for AMENDMENT. outputControllerName/Affiliation work the
 * same way, also AMENDMENT-only — the one point besides issuance where the
 * output controller can be re-selected (see AuthorizedPersonsPanel, which
 * is read-only). Both must be given together to change it; a fresh identity
 * is generated when they are.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  try {
    const { id, requestId } = await params;
    const body = await req.json();

    const decision = body.decision as 'APPROVED' | 'REJECTED';
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      return NextResponse.json({ error: 'decision must be APPROVED or REJECTED' }, { status: 400 });
    }

    const auth = await requireRole(body.actingUserId, [...DECIDE_ROLES]);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const request = await prisma.permitChangeRequest.findUnique({
      where: { id: requestId },
      include: CHANGE_REQUEST_INCLUDE,
    });
    if (!request || request.permitId !== id) {
      return NextResponse.json({ error: 'Change request not found' }, { status: 404 });
    }
    if (request.status !== 'REQUESTED') {
      return NextResponse.json({ error: 'This request has already been decided' }, { status: 422 });
    }

    const permit = request.permit;
    if (!permit.isCurrent) {
      return NextResponse.json({ error: 'This permit version has been superseded' }, { status: 422 });
    }

    const now = new Date();

    if (decision === 'REJECTED') {
      const updated = await rejectChangeRequest(requestId, auth.user.id, body.comment, now);
      return NextResponse.json(updated);
    }

    // APPROVED — supersede the current version with a new one (D6.4 §9.3).
    const prep = await prepareApproval(request, permit, body, now);
    if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status });
    const {
      effect, newValidUntil, newValidUntilResolved, requestedEffectiveDate, deferred, newVersion,
      speOperatorId, speTypeId, speOperatorName, speOperatorProviderName, speTypeName,
      researcherRow, newOutputController,
    } = prep;

    const { signature, signedAt, signingKeyId } = await signPermit({
      permitNumber: permit.permitNumber,
      version: newVersion,
      applicationId: permit.applicationId,
      issuedAt: now,
      validFrom: permit.validFrom,
      validUntil: newValidUntilResolved,
      grantedDatasets: groupDatasetsByHolder(permit.grantedDatasets),
      speOperator: speOperatorId
        ? {
            id: speOperatorId,
            name: speOperatorName ?? '',
            providerName: speOperatorProviderName,
            type: speTypeId ? { id: speTypeId, name: speTypeName ?? '' } : null,
          }
        : null,
      researcher: researcherRow?.did
        ? { affiliation: researcherRow.affiliation, did: researcherRow.did }
        : null,
      outputController: { affiliation: newOutputController.affiliation, did: newOutputController.did },
    });

    const newPermitId = await prisma.$transaction(async (tx) => {
      await retireCurrentVersion(tx, permit, deferred);

      const newPermit = await createNewPermitVersion(tx, {
        permit,
        newVersion,
        deferred,
        requestedEffectiveDate,
        effect,
        newValidUntilResolved,
        now,
        signature,
        signedAt,
        signingKeyId,
        speOperatorId,
        speTypeId,
        speOperatorName,
        speOperatorProviderName,
        speTypeName,
      });

      await carryForwardAuthorizedPersons(tx, newPermit, researcherRow, newOutputController);
      await carryForwardGrantedDatasets(tx, newPermit, permit, auth.user.id);
      await repointSpeProvisioning(tx, permit, newPermit, deferred);
      await approveChangeRequest(tx, requestId, auth.user.id, now, body.comment, newValidUntil);
      await logVersionTransition(tx, newPermit, permit, request, effect, deferred, body.comment, auth.user.id);

      // 7. Render and store the new version's PDF — the official legal
      // document — now that its authorised persons (step 3) are in place.
      await regenerateStoredPermitPdf(newPermit.id, tx);

      return newPermit.id;
    });

    return NextResponse.json({ ok: true, newPermitId, pending: deferred });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to decide change request';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
