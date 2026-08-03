/**
 * Parsing and validation for the HealthData@EU NCP application payload.
 *
 * The format follows the TEHDAS2 D6.4 interoperability schema — a JSON
 * envelope wrapping the EHDS common data access application form fields.
 * Member States may extend the envelope with national fields; those are
 * stored verbatim in hdeuRawPayload.
 */

import { prisma } from './db';
import { calculateDecisionDeadline } from './workflow';

export type HdeuPayload = {
  // Envelope (NCP routing layer)
  hdeuApplicationId: string;       // Sending DAAMS reference, e.g. "FI-HDAB-2025-0042"
  sendingCountry: string;          // ISO 3166-1 alpha-2, e.g. "FI"
  sendingHdab: string;             // Name of the sending HDAB
  transmissionTimestamp: string;   // ISO 8601
  ncpTransactionId?: string;       // HealthData@EU NCP transaction ID (optional)

  // Application type
  applicationType: 'DATA_ACCESS_APPLICATION' | 'DATA_REQUEST';

  // Applicant
  applicantName: string;
  applicantEmail: string;
  applicantOrganisation: string;

  // EHDS common form fields
  title: string;
  projectDescription: string;
  purposeCategory: string;
  legalBasis: string;
  // Grouped by data holder — a national extension of the envelope (the base
  // TEHDAS2 D6.4 interoperability schema doesn't define per-holder
  // granularity at the application stage); Member States may extend the
  // envelope with such fields per the module comment above.
  requestedDatasets: { dataHolderName: string; datasets: { name: string; url?: string | null }[] }[];
  requestedVariables: string;
  studyPopulation: string;
  inclusionCriteria: string;
  exclusionCriteria: string;
  dataStartDate?: string;       // ISO 8601 date
  dataEndDate?: string;
  projectStartDate?: string;
  projectEndDate?: string;
  dataProcessingCountry: string;
};

export type ParseResult =
  | { ok: true; payload: HdeuPayload }
  | { ok: false; errors: string[] };

const REQUIRED: (keyof HdeuPayload)[] = [
  'hdeuApplicationId',
  'sendingCountry',
  'sendingHdab',
  'transmissionTimestamp',
  'applicationType',
  'applicantName',
  'applicantEmail',
  'applicantOrganisation',
  'title',
  'projectDescription',
  'purposeCategory',
  'legalBasis',
  'requestedDatasets',
  'requestedVariables',
  'studyPopulation',
  'inclusionCriteria',
  'exclusionCriteria',
  'dataProcessingCountry',
];

export function parseHdeuPayload(raw: unknown): ParseResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['Payload must be a JSON object'] };
  }

  const errors: string[] = [];
  const obj = raw as Record<string, unknown>;

  for (const field of REQUIRED) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (
    obj.applicationType !== 'DATA_ACCESS_APPLICATION' &&
    obj.applicationType !== 'DATA_REQUEST'
  ) {
    errors.push('applicationType must be DATA_ACCESS_APPLICATION or DATA_REQUEST');
  }

  if (!Array.isArray(obj.requestedDatasets)) {
    errors.push('requestedDatasets must be an array');
  } else if (
    obj.requestedDatasets.some((g) => {
      if (typeof g !== 'object' || g === null) return true;
      const group = g as Record<string, unknown>;
      if (typeof group.dataHolderName !== 'string' || !Array.isArray(group.datasets)) return true;
      return group.datasets.some(
        (d) => typeof d !== 'object' || d === null || typeof (d as Record<string, unknown>).name !== 'string',
      );
    })
  ) {
    errors.push('requestedDatasets must be an array of { dataHolderName, datasets: [{ name, url? }] }');
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, payload: obj as unknown as HdeuPayload };
}

export type CreateApplicationResult =
  | { ok: true; application: { id: string; referenceNumber: string; decisionDeadline: Date | null } }
  | { ok: false; status: 409 | 500; error: string };

/**
 * Registers a parsed HdeuPayload as a new cross-border application in
 * SUBMITTED state (clock starts immediately — the application was already
 * assessed for completeness by the sending Member State's HDAB before
 * transmission). Shared by both NCP intake paths: the direct JSON import
 * (`/api/import/hdeu`) and the two-step NCP fetch
 * (`/api/import/ncp-applications/[id]`, list-then-detail) — one place for
 * the find-or-create/creation logic so the two don't drift apart.
 */
export async function createApplicationFromHdeuPayload(
  p: HdeuPayload,
  rawPayload: unknown,
): Promise<CreateApplicationResult> {
  // Deduplicate: reject if this HD@EU application ID was already imported
  const existing = await prisma.application.findFirst({
    where: { hdeuApplicationId: p.hdeuApplicationId },
  });
  if (existing) {
    return { ok: false, status: 409, error: `Already imported as ${existing.referenceNumber}` };
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
    return {
      ok: false,
      status: 500,
      error: 'No HDAB staff user found to attribute the import. Seed the database first.',
    };
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
      hdeuRawPayload: JSON.stringify(rawPayload),

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

  return {
    ok: true,
    application: {
      id: application.id,
      referenceNumber: application.referenceNumber,
      decisionDeadline: application.decisionDeadline,
    },
  };
}
