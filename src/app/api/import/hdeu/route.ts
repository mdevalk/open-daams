import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseHdeuPayload } from '@/lib/hdeu';
import { calculateDecisionDeadline } from '@/lib/workflow';

/**
 * POST /api/import/hdeu
 *
 * Accepts a HealthData@EU NCP JSON payload and registers it as a new
 * cross-border application in SUBMITTED state (clock starts immediately
 * because the application was already assessed for completeness by the
 * sending Member State's HDAB before transmission).
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const parsed = parseHdeuPayload(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.errors }, { status: 422 });
    }

    const p = parsed.payload;

    // Deduplicate: reject if this HD@EU application ID was already imported
    const existing = await prisma.application.findFirst({
      where: { hdeuApplicationId: p.hdeuApplicationId },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Already imported as ${existing.referenceNumber}` },
        { status: 409 },
      );
    }

    // Find or create an APPLICANT user record for the cross-border applicant.
    // Their organisation is free text on the incoming payload (another
    // country's HDAB, outside our registry) — find-or-create a DataUser by
    // name to resolve it to a masterdata reference.
    let applicant = await prisma.user.findUnique({ where: { email: p.applicantEmail } });
    if (!applicant) {
      const dataUser = await prisma.dataUser.upsert({
        where: { name: p.applicantOrganisation },
        update: {},
        create: { name: p.applicantOrganisation },
      });
      applicant = await prisma.user.create({
        data: {
          name: p.applicantName,
          email: p.applicantEmail,
          dataUserId: dataUser.id,
          role: 'APPLICANT',
        },
      });
    }

    // Find an admin/system user to attribute the import audit entry
    const systemUser =
      (await prisma.user.findFirst({ where: { role: 'ADMIN' } })) ??
      (await prisma.user.findFirst({ where: { role: 'CASE_HANDLER' } }));
    if (!systemUser) {
      return NextResponse.json(
        { error: 'No HDAB staff user found to attribute the import. Seed the database first.' },
        { status: 500 },
      );
    }

    const now = new Date(p.transmissionTimestamp);
    const count = await prisma.application.count();
    const referenceNumber = `HDAB-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    const application = await prisma.application.create({
      data: {
        referenceNumber,
        source: 'HDEU',
        type: p.applicationType,
        status: 'SUBMITTED',
        isCrossBorder: true,

        hdeuApplicationId: p.hdeuApplicationId,
        hdeuSendingCountry: p.sendingCountry,
        hdeuReceivedAt: now,
        hdeuRawPayload: JSON.stringify(body),

        applicantId: applicant.id,

        title: p.title,
        projectDescription: p.projectDescription,
        purposeCategory: p.purposeCategory,
        legalBasis: p.legalBasis,
        requestedVariables: p.requestedVariables,
        studyPopulation: p.studyPopulation,
        inclusionCriteria: p.inclusionCriteria,
        exclusionCriteria: p.exclusionCriteria,
        dataStartDate: p.dataStartDate ? new Date(p.dataStartDate) : null,
        dataEndDate: p.dataEndDate ? new Date(p.dataEndDate) : null,
        projectStartDate: p.projectStartDate ? new Date(p.projectStartDate) : null,
        projectEndDate: p.projectEndDate ? new Date(p.projectEndDate) : null,
        dataProcessingCountry: p.dataProcessingCountry,

        submittedAt: now,
        decisionDeadline: calculateDecisionDeadline(now),
      },
    });

    if (p.requestedDatasets.length > 0) {
      // Same find-or-create treatment as the applicant's DataUser above —
      // incoming data holder names are free text from another HDAB, not
      // guaranteed to already exist in our registry.
      const dataHolderIdsByName = new Map<string, string>();
      for (const g of p.requestedDatasets) {
        if (!dataHolderIdsByName.has(g.dataHolderName)) {
          const dh = await prisma.dataHolder.upsert({
            where: { name: g.dataHolderName },
            update: {},
            create: { name: g.dataHolderName },
          });
          dataHolderIdsByName.set(g.dataHolderName, dh.id);
        }
      }
      await prisma.requestedDataset.createMany({
        data: p.requestedDatasets.flatMap((g) =>
          g.datasets.map((d) => ({
            applicationId: application.id,
            dataHolderId: dataHolderIdsByName.get(g.dataHolderName)!,
            name: d.name,
            url: d.url || null,
          })),
        ),
      });
    }

    await prisma.auditLog.create({
      data: {
        applicationId: application.id,
        userId: systemUser.id,
        toStatus: 'SUBMITTED',
        action: `Received via HealthData@EU NCP from ${p.sendingCountry} (${p.sendingHdab})`,
        comment: `HD@EU application ID: ${p.hdeuApplicationId}${
          p.ncpTransactionId ? ` | NCP transaction: ${p.ncpTransactionId}` : ''
        }`,
      },
    });

    return NextResponse.json(
      {
        referenceNumber: application.referenceNumber,
        id: application.id,
        decisionDeadline: application.decisionDeadline,
      },
      { status: 201 },
    );
  } catch (e) {
    console.error('Failed to import HD@EU application', e);
    const message = e instanceof Error ? e.message : 'Failed to import application';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
