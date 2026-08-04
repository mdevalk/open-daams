/**
 * HealthData@EU NCP query — HDAB-NL test environment.
 *
 * TEHDAS2 D6.4 describes the National Contact Point as the routing layer
 * through which a receiving HDAB retrieves cross-border applications that
 * have been queued for it by sending Member States. This calls the National
 * Dispatcher OpenAPI on the HDAB-NL test environment
 * (https://ap.hdab-nl.eu/national-dispatcher/) in two steps: a thin list
 * (`GET applications`) and a per-item detail fetch (`GET applications/<id>`,
 * which returns a ZIP archive, not JSON). No mock/fixture fallback for
 * either step — every failure (missing API key, unreachable host, non-OK
 * response, unexpected shape) is surfaced as a real, visible error while
 * this is being integrated against the real environment.
 */

import AdmZip from 'adm-zip';
import { HdeuAttachment, HdeuDatasetVariable, HdeuInvoicingDetails, HdeuPayload, HdeuStudyCohort } from './hdeu';

/** Wire shape of one row from `GET applications` — kept separate from our
 * internal naming (see hdeu.ts's module comment for the same convention). */
type NcpApplicationListEntryWire = {
  application_id: string;
  applicationType: 'application' | 'request';
  status: string;
  title: string;
  dateSubmitted: string;
  version: number;
};

export type NcpApplicationSummary = {
  applicationId: string;
  applicationType: 'DATA_ACCESS_APPLICATION' | 'DATA_REQUEST';
  status: string;
  title: string;
  dateSubmitted: string;
  version: number;
};

const NCP_BASE_URL = 'https://ap.hdab-nl.eu/national-dispatcher/';

function ncpHeaders(): Record<string, string> | null {
  const apiKey = process.env.NCP_API_KEY;
  return apiKey ? { 'X-API-key': apiKey } : null;
}

function toApplicationType(wire: 'application' | 'request'): NcpApplicationSummary['applicationType'] {
  return wire === 'request' ? 'DATA_REQUEST' : 'DATA_ACCESS_APPLICATION';
}

/**
 * Parses and normalizes the real `GET applications` response, then dedupes
 * to the highest `version` per `application_id` — the real environment
 * returns one row per version, not one row per application (confirmed: the
 * same id reappears with a later dateSubmitted and a higher version number
 * when a test application is resubmitted).
 */
function parseApplicationList(raw: unknown): NcpApplicationSummary[] {
  if (!Array.isArray(raw)) {
    throw new Error('NCP applications response was not an array');
  }

  const latestById = new Map<string, NcpApplicationSummary>();
  for (const entry of raw as NcpApplicationListEntryWire[]) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof entry.application_id !== 'string' ||
      typeof entry.title !== 'string' ||
      typeof entry.version !== 'number'
    ) {
      throw new Error('NCP applications response entry has an unexpected shape');
    }
    const summary: NcpApplicationSummary = {
      applicationId: entry.application_id,
      applicationType: toApplicationType(entry.applicationType),
      status: entry.status,
      title: entry.title,
      dateSubmitted: entry.dateSubmitted,
      version: entry.version,
    };
    const existing = latestById.get(summary.applicationId);
    if (!existing || summary.version > existing.version) {
      latestById.set(summary.applicationId, summary);
    }
  }
  // Most recently submitted first.
  return Array.from(latestById.values()).sort(
    (a, b) => new Date(b.dateSubmitted).getTime() - new Date(a.dateSubmitted).getTime(),
  );
}

/**
 * Outbound leg: transmitting a decision card for an HD@EU-sourced
 * application (D6.4 R9.2.1) via the NCP. Falls back to a local log line if
 * no API key is configured or the test environment call fails — the caller
 * is responsible for recording the "sent" timestamp on the application
 * either way. Not part of this NCP-fetch fix — untouched.
 */
export async function sendDecisionCardToNcp(application: { id: string; hdeuApplicationId: string | null }): Promise<void> {
  const headers = ncpHeaders();
  if (headers) {
    try {
      const res = await fetch(`${NCP_BASE_URL}decision-cards`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: application.id,
          hdeuApplicationId: application.hdeuApplicationId,
          transmittedAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error(`NCP decision-cards POST returned ${res.status}`);
      console.log(`[NCP] Decision card transmitted for application ${application.id} via ${NCP_BASE_URL}decision-cards`);
      return;
    } catch (err) {
      console.warn(
        `[NCP] Decision-card transmission to ${NCP_BASE_URL}decision-cards failed, logging locally instead:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  console.log(
    `[NCP mock] Decision card transmitted for application ${application.id} ` +
    `(HD@EU ref: ${application.hdeuApplicationId ?? 'unknown'})`,
  );
}

/** Node's fetch wraps the real network error in `.cause` — surfacing just
 * `.message` gives the unhelpful generic "fetch failed" with none of the
 * actual reason (DNS, TLS, connection refused, etc.), so include it. */
function describeFetchError(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    return cause ? `${err.message}: ${String(cause)}` : err.message;
  }
  return String(err);
}

/**
 * Inbound leg, step 1: the thin applications list. No fallback — every
 * failure throws with as much diagnostic detail as available.
 */
export async function getNcpApplicationList(): Promise<NcpApplicationSummary[]> {
  const headers = ncpHeaders();
  if (!headers) {
    throw new Error('NCP_API_KEY is not configured — cannot fetch the applications list');
  }

  let res: Response;
  try {
    res = await fetch(`${NCP_BASE_URL}applications`, { headers });
  } catch (err) {
    throw new Error(`Applications list fetch from ${NCP_BASE_URL}applications failed: ${describeFetchError(err)}`);
  }

  if (!res.ok) {
    throw new Error(`Applications list GET returned ${res.status} ${res.statusText}`);
  }

  const body = await res.json();
  return parseApplicationList(body);
}

/**
 * Inbound leg, step 2: fetch one application's full detail. Returns the raw
 * ZIP bytes — the real environment does not return JSON here. No fixture
 * fallback: importing a specific application either uses real data from the
 * real environment or fails visibly; there's no equivalent synthetic ZIP to
 * substitute.
 */
export async function getNcpApplicationDetail(applicationId: string): Promise<Buffer> {
  const headers = ncpHeaders();
  if (!headers) {
    throw new Error('NCP_API_KEY is not configured — cannot fetch application detail');
  }
  const res = await fetch(`${NCP_BASE_URL}applications/${applicationId}`, { headers });
  if (!res.ok) {
    throw new Error(`NCP application detail GET returned ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Re-fetches the detail archive and extracts one named attachment — either
 * directly in the outer zip, or one level down inside a nested zip (e.g.
 * application_file.zip). Used both for the supporting-document links shown
 * after a successful mapping, and as the fallback "open it by hand" escape
 * hatch if mapNcpDetailZipToHdeuPayload fails on an unexpected shape.
 */
export async function getNcpApplicationAttachment(applicationId: string, filename: string): Promise<Buffer> {
  const zipBuffer = await getNcpApplicationDetail(applicationId);
  const zip = new AdmZip(zipBuffer);
  for (const entry of zip.getEntries()) {
    if (entry.entryName === filename) return entry.getData();
    if (entry.entryName.endsWith('.zip')) {
      const nested = new AdmZip(entry.getData()).getEntry(filename);
      if (nested) return nested.getData();
    }
  }
  throw new Error(`Attachment "${filename}" not found in the NCP detail archive for application ${applicationId}`);
}

/**
 * Thrown by mapNcpDetailZipToHdeuPayload while the real mapping is still a
 * placeholder (see its own doc comment). Carries the discovered attachment
 * paths (e.g. inside a nested application_file.zip) so callers can offer
 * them for direct download/viewing — "path" is entryName-within-the-nested-
 * zip, needed by getNcpApplicationAttachment to re-extract the same file.
 */
export class NcpDetailMappingError extends Error {
  constructor(message: string, public readonly attachments: string[]) {
    super(message);
    this.name = 'NcpDetailMappingError';
  }
}

/** Lists every attachment name reachable from the detail archive — the
 * outer zip's own entries plus one level into any nested zip (e.g.
 * application_file.zip) — used as the fallback "open attachment" links
 * when the real mapping below fails on an application with an unexpected
 * shape, so there's still a way to inspect it by hand. */
function collectAttachmentNames(zip: AdmZip): string[] {
  const names: string[] = [];
  for (const entry of zip.getEntries()) {
    if (entry.entryName.endsWith('.zip')) {
      names.push(...new AdmZip(entry.getData()).getEntries().map((e) => e.entryName));
    } else {
      names.push(entry.entryName);
    }
  }
  return names;
}

// --- Real detail-archive metadata shape (confirmed against application
// 6a70b4d104db074a00fd905d) -------------------------------------------

type NcpKeyValue = { key: string; value: string };
type NcpAttachmentRef = { id: string; name: string; size: number };

type NcpDatasetEntry = {
  dataset_id: string;
  publisher: { name: string };
  title: Record<string, string>;
  country: { country_id: string };
  hdab: { name: string };
  variables: { titles: Record<string, string> }[];
};

/** One `form.section6` entry — the real environment's export is flatter than
 * the D6.3 Annex 5 guideline spec (no separate controls/relatives criteria
 * sub-blocks, just two booleans) — see mapMetadataToHdeuPayload's own note. */
type NcpSection6Entry = {
  country_id?: string;
  hdabContacts?: string;
  howWillTheDataFromDifferentSourcesBeLinked?: string;
  howIsTheStudyCohortFormed?: NcpKeyValue;
  sizeOfTheStudyCohort?: string;
  sizeOfTheStudyCohortEstimationOrExact?: NcpKeyValue; // "This is an estimation..." | "This is the exact..."
  whyNeedStudyCohortOfThisSize?: string;
  variablesToBeUsedInDataExtractionAttachment?: NcpAttachmentRef[];
  timePeriodOfDataExtraction?: string;
  extractionMethod?: NcpKeyValue;
  inclusionCriteria?: string;
  potentialExclusionCriteria?: string;
  howOftenDoesTheDataNeedToBeExtracted?: NcpKeyValue;
  orderForDataExtraction?: string;
  willControlsBeExtracted?: NcpKeyValue;
  willRelativesBeExtracted?: NcpKeyValue;
};

/** A phone number as transmitted — structured, not a plain string. */
type NcpPhone = { number: string; countryCode: string; isoCode: string };

/** The metadata JSON is the full HD@EU application form, `section1`..`section10`
 * (native-language values), mirrored in English under `form_translations.en`
 * — confirmed against a real sample, but every field is form-dependent (the
 * sending country's application may or may not populate any given one), so
 * everything below is optional. */
type NcpMetadata = {
  application_id: string;
  datasets: NcpDatasetEntry[];
  title: string;
  dateSubmitted: string;
  application_type: 'DATA_ACCESS_APPLICATION' | 'DATA_REQUEST';
  form: {
    section1?: {
      datasetVariables?: {
        name: string;
        titles?: Record<string, string>;
        datatype?: string;
        description?: Record<string, string>;
        propertyUrl?: string;
        datasetId: string;
      }[];
    };
    section2?: {
      projectName?: string;
      projectLeader?: string;
      countryOfProjectLeader?: NcpKeyValue;
      summaryOfTheProject?: string;
      purposeForWhichDataWillBeUsed?: NcpKeyValue[];
    };
    // legalOrNaturalPerson gates which branch is populated: when "Legal
    // person", legalPersonName + a separate contactPerson* block; when
    // "Natural person", the naturalPerson* fields cover both at once
    // (confirmed: both branches seen across real samples).
    section3?: {
      applyingForDataOnBehalfOfPublicSector?: NcpKeyValue;
      legalOrNaturalPerson?: NcpKeyValue;
      legalPersonName?: string;
      legalPersonAddress?: string;
      legalPersonZipCode?: string;
      legalPersonCity?: string;
      legalPersonCountry?: NcpKeyValue;
      contactPersonName?: string;
      contactPersonEmail?: string;
      contactPersonPhone?: NcpPhone;
      contactPersonRelationship?: string;
      contactPersonOrganisationName?: string;
      contactPersonBusinessID?: string;
      naturalPersonName?: string;
      naturalPersonAddress?: string;
      naturalPersonZipCode?: string;
      naturalPersonCity?: string;
      naturalPersonCountry?: NcpKeyValue;
      naturalPersonEmail?: string;
      naturalPersonPhone?: NcpPhone;
      naturalPersonJobTitle?: string;
      naturalPersonAffiliation?: string;
    };
    section4?: {
      sameAsContactPerson?: boolean;
      fullName?: string;
      address?: string;
      phone?: NcpPhone;
      email?: string;
      nameOfTheOrganisation?: string;
      businessIdentifierOrganization?: string;
      vatNumber?: string;
      invoiceType?: NcpKeyValue;
      invoiceReferenceNumber?: string;
      operatorIdentifier?: string;
      invoiceAddress?: string;
      peppolCode?: string;
      isTheProjectFinanciallyCovered?: NcpKeyValue;
      rangeOfAmountOfFinancing?: NcpKeyValue;
    };
    section5?: {
      whyTheDataIsNeeded?: string;
      whatIsTheAimAndTopicOfTheProject?: string;
      whichAreTheExpectedBenefits?: string;
      describeApplicantsQualification?: string;
      legalBasis?: string;
      linkToTheSupportingLegalBasis?: string;
      summaryOfPlanForUsingTheData?: NcpAttachmentRef[];
      summaryOfResearchPlan?: NcpAttachmentRef[];
      formatOfTheElectronicHealthData?: NcpKeyValue;
      personResponsibleName?: string;
    };
    section6?: NcpSection6Entry[];
    section7?: {
      willDataBeCombinedWithDataObtained?: NcpKeyValue;
      otherPermitApplications?: NcpKeyValue;
    };
    section8?: {
      technicalRequirementsForEnvironment?: string;
      nameWebsiteAddressForEnvironment?: string;
      whenDataNeeded?: NcpKeyValue;
      estimatedStartDatesForDataProcessing?: string;
      estimatedEndDatesForDataProcessing?: string;
      startPeriodOfInactiveDataStorage?: string;
      endPeriodOfInactiveDataStorage?: string;
      optOutOfTheMechanismProvidedInTheNationalLaw?: NcpKeyValue;
      optOutJustification?: string;
      willTheDataBeTransferred?: NcpKeyValue;
      transferLegalArticle?: string;
      transferSafeguards?: string[];
      whichOrganizationWillBeTheControllerOfData?: string;
      complyWithDataMinimisationPrinciple?: string;
      peopleWhoWillBeProcessingTheData?: { fullName: string; emailAddress: string }[];
      protectionAndSecurityStatementsA?: boolean;
      protectionAndSecurityStatementsB?: boolean;
      protectionAndSecurityStatementsC?: boolean;
      protectionAndSecurityStatementsD?: boolean;
      protectionAndSecurityStatementsE?: boolean;
      legalBasisForProcessingPersonalData?: NcpKeyValue[];
      hdabToRetain?: NcpKeyValue;
    };
    section10?: {
      awareProcessingFee?: boolean;
      awareChargeFee?: boolean;
      awareInformationCorrect?: boolean;
      noAccessToUnderlyingData?: boolean; // DATA_REQUEST only
    };
  };
};

/** Purpose selection maps 1:1 onto Art. 53(1)(a)-(e) by letter. The real form
 * lets an applicant tick more than one — the full selection is captured in
 * purposeCategories; the single-value purposeCategory column keeps its
 * existing "first selection wins" simplification for backward compat.
 * CARE_IMPROVEMENT (the app's 6th category) has no direct top-level letter
 * in the real form — it's folded into (e)'s sub-points, so it never gets
 * selected by this mapping. */
const PURPOSE_BY_KEY: Record<string, string> = {
  a: 'PUBLIC_HEALTH',
  b: 'POLICY_MAKING',
  c: 'STATISTICS',
  d: 'EDUCATION',
  e: 'SCIENTIFIC_RESEARCH',
};

function localized(map: Record<string, string> | undefined, fallback: string): string {
  if (!map) return fallback;
  return map.en ?? map.nl ?? Object.values(map)[0] ?? fallback;
}

/** Best-effort parse of "dd-mm-yyyy t/m dd-mm-yyyy" (the only format seen so
 * far) into ISO dates — free text, not structured, so anything that doesn't
 * match this exact shape is left unset rather than risk importing a wrong
 * date silently. */
function parseDutchDateRange(text: string | undefined): { start?: string; end?: string } {
  if (!text) return {};
  const match = text.match(/(\d{2})-(\d{2})-(\d{4}).*?(\d{2})-(\d{2})-(\d{4})/);
  if (!match) return {};
  const [, d1, m1, y1, d2, m2, y2] = match;
  return { start: `${y1}-${m1}-${d1}`, end: `${y2}-${m2}-${d2}` };
}

/** Reads a value that may arrive as a plain string or as an {key, value}
 * pair (both shapes have been seen across different sections of the same
 * real sample) — used for the several §6/§8 fields whose exact wire shape
 * isn't fully pinned down yet. */
function rawText(v: string | NcpKeyValue | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'string' ? v : v.value;
}

/** Most yes/no radio-button questions arrive as {key, value} — matched on
 * `key` ("a" = Yes, "b" = No), confirmed stable across every real sample
 * seen so far, rather than the label `value`, which is submitted in the
 * applicant's own language (Dutch, French, ...) and so can't be matched by
 * an English substring like "yes"/"no". Falls back to English-text matching
 * only when no key is present, for defensiveness. */
function yesNo(v: NcpKeyValue | boolean | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'boolean') return v;
  if (v.key === 'a') return true;
  if (v.key === 'b') return false;
  return v.value?.toLowerCase() === 'yes';
}

function formatPhone(p: NcpPhone | undefined): string | undefined {
  if (!p?.number) return undefined;
  return p.countryCode ? `+${p.countryCode} ${p.number}` : p.number;
}

// Multi-choice radio buttons below are matched on `key`, not the label
// `value` — same reasoning as yesNo() above: the label is submitted in the
// applicant's own language, but the key/option-ordering is stable (matches
// the D6.3 Annex 5 guideline's documented radio-button order, confirmed
// against every real key/value pair seen across samples so far).
const COHORT_FORMATION_BY_KEY: Record<string, HdeuStudyCohort['cohortFormationMethod']> = {
  a: 'CRITERIA',
  b: 'PREVIOUS_COHORT',
  c: 'COMBINED',
  d: 'WHOLE_POPULATION',
};

const EXTRACTION_METHOD_BY_KEY: Record<string, HdeuStudyCohort['extractionMethod']> = {
  a: 'RANDOM_SAMPLE',
  b: 'ALL_QUALIFYING',
  c: 'OTHER_SAMPLE',
};

function mapExtractionMethod(v: NcpKeyValue | undefined): HdeuStudyCohort['extractionMethod'] {
  return v?.key ? EXTRACTION_METHOD_BY_KEY[v.key] : undefined;
}

const EXTRACTION_FREQUENCY_BY_KEY: Record<string, HdeuPayload['extractionFrequency']> = {
  a: 'ONCE',
  b: 'MULTIPLE_TIMES',
};

function mapExtractionFrequency(v: NcpKeyValue | undefined): HdeuPayload['extractionFrequency'] {
  return v?.key ? EXTRACTION_FREQUENCY_BY_KEY[v.key] : undefined;
}

const DATA_ACCESS_TIMING_BY_KEY: Record<string, HdeuPayload['dataAccessTiming']> = {
  a: 'AS_SOON_AS_POSSIBLE',
  b: 'LATER',
};

function mapDataAccessTiming(v: NcpKeyValue | undefined): HdeuPayload['dataAccessTiming'] {
  return v?.key ? DATA_ACCESS_TIMING_BY_KEY[v.key] : undefined;
}

function toAttachments(field: string, refs: NcpAttachmentRef[] | undefined): HdeuAttachment[] {
  return (refs ?? []).map((r) => ({ field, filename: r.name, sizeBytes: r.size, description: r.id }));
}

/**
 * Maps one `form.section6` entry (one country's cohort scope) to a COHORT-
 * role StudyCohort. The real environment's export doesn't carry separate
 * controls/relatives criteria sub-blocks (just the two boolean flags below,
 * mirrored onto HdeuPayload.includesControls/includesRelatives by the
 * caller) — so no CONTROL/RELATIVE entries are produced from today's wire
 * shape; the schema has room for them once/if the sender starts including
 * that detail (see StudyCohort in schema.prisma).
 */
function mapSection6Entry(entry: NcpSection6Entry, dataProcessingCountry: string): HdeuStudyCohort {
  const { start: dataStartDate, end: dataEndDate } = parseDutchDateRange(entry.timePeriodOfDataExtraction);
  return {
    countryId: (entry.country_id || dataProcessingCountry).toUpperCase(),
    role: 'COHORT',
    hdabContacts: entry.hdabContacts,
    howWillDataBeLinked: entry.howWillTheDataFromDifferentSourcesBeLinked,
    cohortFormationMethod: entry.howIsTheStudyCohortFormed?.key
      ? COHORT_FORMATION_BY_KEY[entry.howIsTheStudyCohortFormed.key]
      : undefined,
    size: entry.sizeOfTheStudyCohort ? parseInt(entry.sizeOfTheStudyCohort, 10) || undefined : undefined,
    // key "a" = "This is an estimation...", key "b" = "This is the exact size..." (D6.3 Annex 5 §6.1 order)
    sizeIsEstimate: entry.sizeOfTheStudyCohortEstimationOrExact
      ? entry.sizeOfTheStudyCohortEstimationOrExact.key === 'a'
      : undefined,
    sizeJustification: entry.whyNeedStudyCohortOfThisSize,
    variablesAttachmentRef: entry.variablesToBeUsedInDataExtractionAttachment?.[0]?.name,
    timePeriod: entry.timePeriodOfDataExtraction,
    dataStartDate,
    dataEndDate,
    extractionMethod: mapExtractionMethod(entry.extractionMethod),
    inclusionCriteria: entry.inclusionCriteria,
    exclusionCriteria: entry.potentialExclusionCriteria,
    extractionFrequency: mapExtractionFrequency(entry.howOftenDoesTheDataNeedToBeExtracted),
    orderForExtraction: entry.orderForDataExtraction,
  };
}

/**
 * Maps the real HD@EU application form (application_metadata.json —
 * confirmed structure, see NcpMetadata above) to HdeuPayload. Every
 * `form.sectionN` block is optional on the wire — the sending country's form
 * populates whatever the applicant filled in, so each field below degrades
 * to `undefined`/a "Not specified" placeholder (for fields HdeuPayload
 * requires) rather than throwing when a section is absent. The nested
 * application_file.zip's DOCX attachments are supporting documents; the
 * attachment *references* (filenames/sizes) are captured via
 * HdeuPayload.attachments, but the file bytes themselves stay in the zip,
 * fetched on demand via the existing attachment route.
 */
function mapMetadataToHdeuPayload(meta: NcpMetadata): HdeuPayload {
  const dataset = meta.datasets[0];
  const form = meta.form;
  const section1 = form.section1 ?? {};
  const section2 = form.section2 ?? {};
  const section3 = form.section3 ?? {};
  const section4 = form.section4;
  const section5 = form.section5 ?? {};
  const section6 = form.section6 ?? [];
  const section7 = form.section7 ?? {};
  const section8 = form.section8 ?? {};
  const section10 = form.section10 ?? {};
  const cohort = section6[0];
  const dataProcessingCountry = (dataset?.country?.country_id || 'nl').toUpperCase();

  const purposeKeys = section2.purposeForWhichDataWillBeUsed?.map((p) => p.key) ?? [];
  const purposeCategories = purposeKeys.map((k) => PURPOSE_BY_KEY[k]).filter((c): c is string => Boolean(c));
  const purposeCategory = purposeCategories[0] || 'SCIENTIFIC_RESEARCH';

  const dataHolderName = dataset?.publisher?.name || dataset?.hdab?.name || 'Unknown';
  const requestedDatasets = dataset
    ? [
        {
          dataHolderName,
          datasets: [{ name: localized(dataset.title, meta.title), url: null }],
        },
      ]
    : [];

  const requestedVariables =
    dataset?.variables?.map((v) => localized(v.titles, v.titles?.[Object.keys(v.titles)[0]] ?? '')).join(', ') ||
    'Not specified';

  const studyCohorts = section6.map((entry) => mapSection6Entry(entry, dataProcessingCountry));

  const invoicingDetails: HdeuInvoicingDetails | undefined = section4
    ? {
        sameAsContactPerson: section4.sameAsContactPerson,
        fullName: section4.fullName,
        email: section4.email,
        phone: formatPhone(section4.phone),
        organisationName: section4.nameOfTheOrganisation,
        address: section4.address,
        businessId: section4.businessIdentifierOrganization,
        vatNumber: section4.vatNumber,
        invoiceType: rawText(section4.invoiceType),
        invoiceReferenceNumber: section4.invoiceReferenceNumber,
        eInvoiceAddress: section4.invoiceAddress,
        operatorId: section4.operatorIdentifier,
        peppolCode: section4.peppolCode,
        isProjectFinanciallyCovered: yesNo(section4.isTheProjectFinanciallyCovered),
        financingAmountRange: rawText(section4.rangeOfAmountOfFinancing),
      }
    : undefined;

  // legalOrNaturalPerson gates which branch of section3 is populated (see
  // NcpMetadata's own note) — both have been observed in real samples.
  const isNaturalPerson = rawText(section3.legalOrNaturalPerson)?.toLowerCase().includes('natural');
  const applicantName = (isNaturalPerson ? section3.naturalPersonName : section3.contactPersonName) || 'Not specified';
  const applicantEmail =
    (isNaturalPerson ? section3.naturalPersonEmail : section3.contactPersonEmail) || 'unknown@unknown.invalid';
  const applicantOrganisation =
    (isNaturalPerson ? section3.naturalPersonAffiliation : section3.legalPersonName) || 'Unknown';

  const attachments = [
    ...toAttachments('section5.summaryOfPlanForUsingTheData', section5.summaryOfPlanForUsingTheData),
    ...toAttachments('section5.summaryOfResearchPlan', section5.summaryOfResearchPlan),
    ...section6.flatMap((entry, i) =>
      toAttachments(`section6[${i}].variablesToBeUsedInDataExtractionAttachment`, entry.variablesToBeUsedInDataExtractionAttachment),
    ),
  ];

  const datasetVariables: HdeuDatasetVariable[] = (section1.datasetVariables ?? []).map((v) => ({
    sourceDatasetId: v.datasetId,
    name: v.name,
    title: v.titles ? localized(v.titles, v.name) : undefined,
    description: v.description ? localized(v.description, '') || undefined : undefined,
    datatype: v.datatype,
    propertyUrl: v.propertyUrl || undefined,
  }));

  return {
    hdeuApplicationId: meta.application_id,
    sendingCountry: dataProcessingCountry,
    sendingHdab: dataset?.hdab?.name || 'Unknown',
    transmissionTimestamp: meta.dateSubmitted,

    applicationType: meta.application_type,

    // §1
    datasetVariables,

    applicantName,
    applicantEmail,
    applicantOrganisation,

    title: meta.title,
    projectDescription: [section5.whatIsTheAimAndTopicOfTheProject, section2.summaryOfTheProject]
      .filter(Boolean)
      .join('\n\n') || 'Not specified',
    purposeCategory,
    purposeCategories,
    projectLeaderName: section2.projectLeader,
    projectLeaderCountry: rawText(section2.countryOfProjectLeader),
    legalBasis: section5.legalBasis || 'Not specified',
    requestedDatasets,
    requestedVariables,
    studyPopulation: cohort
      ? `${cohort.sizeOfTheStudyCohort ?? ''} — ${cohort.howIsTheStudyCohortFormed?.value ?? ''}`.trim()
      : 'Not specified',
    inclusionCriteria: cohort?.inclusionCriteria || 'Not specified',
    exclusionCriteria: cohort?.potentialExclusionCriteria || 'Not specified',
    dataStartDate: studyCohorts[0]?.dataStartDate,
    dataEndDate: studyCohorts[0]?.dataEndDate,
    projectStartDate: section8.estimatedStartDatesForDataProcessing,
    projectEndDate: section8.estimatedEndDatesForDataProcessing,
    dataProcessingCountry,

    // §3
    applyingOnBehalfOfPublicSector: yesNo(section3.applyingForDataOnBehalfOfPublicSector),
    legalOrNaturalPerson: rawText(section3.legalOrNaturalPerson),
    legalPersonAddress: isNaturalPerson ? section3.naturalPersonAddress : section3.legalPersonAddress,
    legalPersonZipCode: isNaturalPerson ? section3.naturalPersonZipCode : section3.legalPersonZipCode,
    legalPersonCity: isNaturalPerson ? section3.naturalPersonCity : section3.legalPersonCity,
    legalPersonCountry: rawText(isNaturalPerson ? section3.naturalPersonCountry : section3.legalPersonCountry),
    contactPersonJobTitle: section3.naturalPersonJobTitle,
    contactPersonAffiliation: isNaturalPerson ? section3.naturalPersonAffiliation : section3.contactPersonOrganisationName,
    contactPersonRelationship: section3.contactPersonRelationship,
    contactPersonBusinessId: section3.contactPersonBusinessID,
    contactPersonPhone: formatPhone(isNaturalPerson ? section3.naturalPersonPhone : section3.contactPersonPhone),

    // §4
    invoicingDetails,

    // §5
    whyDataIsNeeded: section5.whyTheDataIsNeeded,
    expectedBenefits: section5.whichAreTheExpectedBenefits,
    applicantQualifications: section5.describeApplicantsQualification,
    electronicHealthDataFormat: rawText(section5.formatOfTheElectronicHealthData),

    // §6 full fidelity + flat mirror of the first (COHORT, first country) entry
    studyCohorts,
    cohortSizeIsEstimate: studyCohorts[0]?.sizeIsEstimate,
    cohortSize: studyCohorts[0]?.size,
    cohortSizeJustification: studyCohorts[0]?.sizeJustification,
    cohortFormationMethod: studyCohorts[0]?.cohortFormationMethod,
    extractionMethod: studyCohorts[0]?.extractionMethod,
    extractionFrequency: studyCohorts[0]?.extractionFrequency,
    extractionIntervalOther: studyCohorts[0]?.extractionIntervalOther,
    includesControls: yesNo(cohort?.willControlsBeExtracted),
    includesRelatives: yesNo(cohort?.willRelativesBeExtracted),

    // §7
    otherDataToCombine: yesNo(section7.willDataBeCombinedWithDataObtained),
    hasPendingPermitApplications: yesNo(section7.otherPermitApplications),

    // §8
    speTechnicalRequirements: section8.technicalRequirementsForEnvironment,
    environmentProviderName: section8.nameWebsiteAddressForEnvironment,
    dataAccessTiming: mapDataAccessTiming(section8.whenDataNeeded),
    inactiveStoragePeriodStart: section8.startPeriodOfInactiveDataStorage,
    inactiveStoragePeriodEnd: section8.endPeriodOfInactiveDataStorage,
    usesOptOutException: yesNo(section8.optOutOfTheMechanismProvidedInTheNationalLaw),
    optOutExceptionJustification: section8.optOutJustification,
    transfersOutsideEuEea: yesNo(section8.willTheDataBeTransferred),
    transferLegalArticle: section8.transferLegalArticle,
    transferSafeguards: section8.transferSafeguards,
    dataController: section8.whichOrganizationWillBeTheControllerOfData,
    dataMinimisationCompliance: section8.complyWithDataMinimisationPrinciple,
    protectionStatement1: section8.protectionAndSecurityStatementsA,
    protectionStatement2: section8.protectionAndSecurityStatementsB,
    protectionStatement3: section8.protectionAndSecurityStatementsC,
    protectionStatement4: section8.protectionAndSecurityStatementsD,
    protectionStatement5: section8.protectionAndSecurityStatementsE,
    dataProcessingPersonnel: section8.peopleWhoWillBeProcessingTheData?.map(
      (p) => `${p.fullName} <${p.emailAddress}>`,
    ),
    lawfulnessOfProcessing: section8.legalBasisForProcessingPersonalData?.map((kv) => kv.value),

    // §9
    attachments,

    // §10
    consentAwareProcessingFee: section10.awareProcessingFee,
    consentAwareChargeFee: section10.awareChargeFee,
    consentAwareInformationCorrect: section10.awareInformationCorrect,
    consentNoAccessToUnderlyingData: section10.noAccessToUnderlyingData,
  };
}

/**
 * Unzips the detail archive and maps it to HdeuPayload. If the real
 * mapping fails — an application with an unexpected shape, a missing
 * metadata entry, etc. — falls back to NcpDetailMappingError carrying the
 * archive's attachment names, so there's still a way to open/inspect the
 * raw content by hand instead of just a bare error.
 */
export function mapNcpDetailZipToHdeuPayload(zipBuffer: Buffer): HdeuPayload {
  const zip = new AdmZip(zipBuffer);
  try {
    const metadataEntry = zip.getEntry('application_metadata.json');
    if (!metadataEntry) {
      throw new Error('NCP detail archive has no application_metadata.json entry');
    }
    const meta = JSON.parse(metadataEntry.getData().toString('utf-8')) as NcpMetadata;
    return mapMetadataToHdeuPayload(meta);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new NcpDetailMappingError(
      `Failed to map NCP application detail: ${reason}`,
      collectAttachmentNames(zip),
    );
  }
}
