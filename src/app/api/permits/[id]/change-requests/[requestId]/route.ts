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
 * body: { decision: 'APPROVED' | 'REJECTED', userId, comment?, newValidUntil? }
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

    const auth = await requireRole(body.userId, [...DECIDE_ROLES]);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const request = await prisma.permitChangeRequest.findUnique({
      where: { id: requestId },
      include: { permit: { include: { authorizedPersons: true, speProvisioning: true, grantedDatasets: true } } },
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
      return NextResponse.json({ error: 'A new validUntil date is required to approve a renewal' }, { status: 400 });
    }

    const newVersion = permit.version + 1;
    const newValidUntilResolved = newValidUntil ?? permit.validUntil;
    const { signature, signedAt, signingKeyId } = await signPermit({
      permitNumber: permit.permitNumber,
      version: newVersion,
      applicationId: permit.applicationId,
      issuedAt: now,
      validFrom: permit.validFrom,
      validUntil: newValidUntilResolved,
      grantedDatasets: groupDatasetsByHolder(permit.grantedDatasets),
    });

    const newPermitId = await prisma.$transaction(async (tx) => {
      // 1. Retire the current version.
      await tx.dataPermit.update({ where: { id: permit.id }, data: { isCurrent: false } });

      // 2. Create the new version, copying permit content forward. Revocation
      //    markers are intentionally not carried over (a reinstated permit is clean).
      const newPermit = await tx.dataPermit.create({
        data: {
          permitNumber: permit.permitNumber, // stable base id
          version: newVersion,
          isCurrent: true,
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
          permitProcessingFee: permit.permitProcessingFee,
          dataPreparationFee: permit.dataPreparationFee,
          speSetupFee: permit.speSetupFee,
          speUsageFee: permit.speUsageFee,
          additionalServicesFee: permit.additionalServicesFee,
          dataHolderFee: permit.dataHolderFee,
          paymentTerms: permit.paymentTerms,
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
            name: gd.name,
            url: gd.url,
          })),
        });
      }

      // 4. Re-point the SPE provisioning order (one environment spans the lifecycle).
      if (permit.speProvisioning) {
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
          action: `${request.type} approved`,
          comment: body.comment ?? null,
        },
      });

      // 7. Render and store the new version's PDF — the official legal
      // document — now that its authorised persons (step 3) are in place.
      await regenerateStoredPermitPdf(newPermit.id, tx);

      return newPermit.id;
    });

    return NextResponse.json({ ok: true, currentPermitId: newPermitId });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to decide change request';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
