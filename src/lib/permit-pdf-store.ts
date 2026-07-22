import { PrismaClient, Prisma } from '@prisma/client';
import { generatePermitPdf } from './generate-permit-pdf';

type Client = PrismaClient | Prisma.TransactionClient;

// Same shape generatePermitPdf needs — kept in one place so every call site
// (issuance, authorized persons, revoke/expire, version approval) fetches
// identically.
const PDF_INCLUDE = {
  application: {
    select: {
      referenceNumber: true,
      title: true,
      type: true,
      submittedAt: true,
      decisionSummary: true,
      projectDescription: true,
      purposeCategory: true,
      requestedDatasets: true,
      requestedVariables: true,
      studyPopulation: true,
      inclusionCriteria: true,
      exclusionCriteria: true,
      ethicalReviewRequired: true,
      ethicalReviewStatus: true,
      ethicalReviewBody: true,
      ethicalReviewReference: true,
      ethicalReviewDate: true,
      dataStartDate: true,
      dataEndDate: true,
      legalBasis: true,
      dataProcessingCountry: true,
      isCrossBorder: true,
      applicant: { select: { name: true, organisation: true, email: true } },
    },
  },
  authorizedPersons: { orderBy: { addedAt: 'asc' as const } },
  previousPermit: { select: { permitNumber: true, version: true } },
} satisfies Prisma.DataPermitInclude;

/**
 * Re-renders a permit's PDF from its current state and overwrites the
 * stored copy. The PDF is the official legal document (D6.4 §9.1/§9.3), so
 * it must be regenerated on every mutation that affects its content:
 * issuance, authorized-person add/remove, revoke/expire, and each new
 * version issued on amendment/renewal/revocation-appeal approval.
 *
 * Accepts either the main Prisma client or a `$transaction` callback's `tx`,
 * so callers that already hold a transaction can keep the PDF write atomic
 * with the state change that triggered it.
 */
export async function regenerateStoredPermitPdf(permitId: string, client: Client): Promise<void> {
  const permit = await client.dataPermit.findUniqueOrThrow({
    where: { id: permitId },
    include: PDF_INCLUDE,
  });
  const pdfBytes = await generatePermitPdf(permit);
  await client.dataPermit.update({ where: { id: permitId }, data: { pdf: Buffer.from(pdfBytes) } });
}
