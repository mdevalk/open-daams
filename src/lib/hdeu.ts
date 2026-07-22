/**
 * Parsing and validation for the HealthData@EU NCP application payload.
 *
 * The format follows the TEHDAS2 D6.4 interoperability schema — a JSON
 * envelope wrapping the EHDS common data access application form fields.
 * Member States may extend the envelope with national fields; those are
 * stored verbatim in hdeuRawPayload.
 */

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
