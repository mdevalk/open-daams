import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildDigitalPermitDocument, groupDatasetsByHolder } from '@/lib/permit-signing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/permits/[id]/json
 * The digital permit itself: the signed, structured record (D6.4 R9.1.3).
 * The PDF is a human-readable rendering derived from this; this document is
 * the artifact independently verifiable against /.well-known/jwks.json.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const permit = await prisma.dataPermit.findUnique({
      where: { id },
      include: {
        grantedDatasets: { orderBy: { createdAt: 'asc' }, include: { storageLocation: true } },
        authorizedPersons: true,
      },
    });
    if (!permit) {
      return NextResponse.json({ error: 'Permit not found' }, { status: 404 });
    }

    const researcherRow = permit.authorizedPersons.find((p) => p.role === 'RESEARCHER');
    const outputControllerRow = permit.authorizedPersons.find((p) => p.role === 'OUTPUT_CONTROLLER');
    if (!outputControllerRow?.did) {
      return NextResponse.json({ error: 'Permit has no output controller on record' }, { status: 500 });
    }

    // Read the frozen snapshot columns, not a live join — see the schema
    // comment on speOperatorName/etc.
    const document = buildDigitalPermitDocument({
      ...permit,
      grantedDatasets: groupDatasetsByHolder(permit.grantedDatasets),
      speOperator: permit.speOperatorId
        ? {
            id: permit.speOperatorId,
            name: permit.speOperatorName ?? '',
            providerName: permit.speOperatorProviderName,
            type: permit.speTypeId ? { id: permit.speTypeId, name: permit.speTypeName ?? '' } : null,
          }
        : null,
      researcher: researcherRow?.did
        ? { affiliation: researcherRow.affiliation, did: researcherRow.did }
        : null,
      outputController: { affiliation: outputControllerRow.affiliation, did: outputControllerRow.did },
    });
    const filename = `${document.permitId.replace(/\//g, '-')}.json`;

    return new NextResponse(JSON.stringify(document, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error(`Failed to serve digital permit document for ${id}`, e);
    const message = e instanceof Error ? e.message : 'Failed to serve digital permit document';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
