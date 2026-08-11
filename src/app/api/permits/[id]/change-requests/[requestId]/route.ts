import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { DECIDE_ROLES, APPROVAL_EFFECT } from '@/lib/permit-change';
import { signPermit, groupDatasetsByHolder } from '@/lib/permit-signing';
import { regenerateStoredPermitPdf } from '@/lib/permit-pdf-store';

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
 * body: { decision: 'APPROVED' | 'REJECTED', actingUserId, comment?, newValidUntil?, effectiveDate?, speOperatorId?, speTypeId? }
 *
 * speOperatorId/speTypeId carry forward from the current version
 * onto the new one by default (same as the fee fields) — pass them
 * explicitly (a real id, or ''/null to clear) only to change them, which is
 * only meaningful for AMENDMENT.
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
      include: { permit: { include: { authorizedPersons: true, speProvisioning: true, grantedDatasets: true, lineItems: true } } },
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
      const updated = await prisma.permitChangeRequest.update({
        where: { id: requestId },
        data: { status: 'REJECTED', decidedById: auth.user.id, decidedAt: now, decisionComment: body.comment ?? null },
      });
      return NextResponse.json(updated);
    }

    // APPROVED — supersede the current version with a new one (D6.4 §9.3).
    const effect = APPROVAL_EFFECT[request.type];
    const newValidUntil =
      request.type === 'RENEWAL' && body.newValidUntil ? new Date(body.newValidUntil) : undefined;
    if (request.type === 'RENEWAL' && !newValidUntil) {
      return NextResponse.json({ error: 'A new validUntil date is required to approve a renewal' }, { status: 422 });
    }

    // R9.3.9: only AMENDMENT supports a delayed effective date; a blank or
    // today-or-past date takes the immediate path, same as before.
    const requestedEffectiveDate =
      request.type === 'AMENDMENT' && body.effectiveDate ? new Date(body.effectiveDate) : null;
    const deferred = requestedEffectiveDate !== null && requestedEffectiveDate.getTime() > now.getTime();

    const newVersion = permit.version + 1;
    const newValidUntilResolved = newValidUntil ?? permit.validUntil;
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
    });

    const newPermitId = await prisma.$transaction(async (tx) => {
      // 1. Retire the current version — skipped when deferred: the old
      //    version keeps operating until activation.
      if (!deferred) {
        await tx.dataPermit.update({ where: { id: permit.id }, data: { isCurrent: false } });
      }

      // 2. Create the new version, copying permit content forward. Revocation
      //    markers are intentionally not carried over (a reinstated permit is clean).
      const newPermit = await tx.dataPermit.create({
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
            })),
          },
          speOperatorId,
          speTypeId,
          speOperatorName,
          speOperatorProviderName,
          speTypeName,
        },
      });

      // 3. Carry the authorised-persons snapshot forward to the new version.
      if (permit.authorizedPersons.length > 0) {
        await tx.authorizedPerson.createMany({
          data: permit.authorizedPersons.map((p) => ({
            permitId: newPermit.id,
            name: p.name,
            affiliation: p.affiliation,
            email: p.email,
          })),
        });
      }

      // 3b. Carry the granted-datasets snapshot forward to the new version.
      if (permit.grantedDatasets.length > 0) {
        await tx.grantedDataset.createMany({
          data: permit.grantedDatasets.map((gd) => ({
            permitId: newPermit.id,
            dataHolderName: gd.dataHolderName,
            dataHolderId: gd.dataHolderId,
            name: gd.name,
            url: gd.url,
            datasetId: gd.datasetId,
            catalogId: gd.catalogId,
            distributions: gd.distributions ?? undefined,
          })),
        });
      }

      // 4. Re-point the SPE provisioning order (one environment spans the
      //    lifecycle) — skipped when deferred: reconfiguring the SPE is the
      //    whole point of the transition period, so it stays on the old
      //    version until activation.
      if (!deferred && permit.speProvisioning) {
        await tx.speProvisioningOrder.update({
          where: { permitId: permit.id },
          data: { permitId: newPermit.id },
        });
      }

      // 5. Approve the request (stays on the version it was raised against).
      await tx.permitChangeRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          decidedById: auth.user.id,
          decidedAt: now,
          decisionComment: body.comment ?? null,
          newValidUntil: newValidUntil ?? null,
        },
      });

      // 6. Log the transition on the new version.
      await tx.dataPermitLog.create({
        data: {
          permitId: newPermit.id,
          userId: auth.user.id,
          fromStatus: permit.status,
          toStatus: effect.to,
          action: deferred
            ? `${request.type} approved — pending activation`
            : `${request.type} approved`,
          comment: body.comment ?? null,
        },
      });

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
