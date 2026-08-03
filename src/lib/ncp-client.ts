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
import { HdeuPayload } from './hdeu';

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

/** The metadata JSON is the full HD@EU application form, `section1`..`section10`
 * (native-language values), mirrored in English under `form_translations.en`
 * — only the fields this app's Application model actually has room for are
 * typed here, not the whole form. */
type NcpMetadata = {
  application_id: string;
  datasets: NcpDatasetEntry[];
  title: string;
  dateSubmitted: string;
  application_type: 'DATA_ACCESS_APPLICATION' | 'DATA_REQUEST';
  form: {
    section2: { summaryOfTheProject: string; purposeForWhichDataWillBeUsed: NcpKeyValue[] };
    section3: { contactPersonName: string; contactPersonEmail: string; legalPersonName: string };
    section5: {
      whatIsTheAimAndTopicOfTheProject: string;
      legalBasis: string;
      summaryOfPlanForUsingTheData?: NcpAttachmentRef[];
    };
    section6: {
      sizeOfTheStudyCohort: string;
      howIsTheStudyCohortFormed: NcpKeyValue;
      inclusionCriteria: string;
      potentialExclusionCriteria: string;
      timePeriodOfDataExtraction: string;
    }[];
    section8: { estimatedStartDatesForDataProcessing: string; estimatedEndDatesForDataProcessing: string };
  };
};

/** Purpose selection maps 1:1 onto Art. 53(1)(a)-(e) by letter; the app's
 * purposeCategory column stores a single value, but the real form lets an
 * applicant tick more than one — first selection wins, a deliberate
 * simplification rather than a schema change. CARE_IMPROVEMENT (the app's
 * 6th category) has no direct top-level letter in the real form — it's
 * folded into (e)'s sub-points, so it never gets selected by this mapping. */
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

/**
 * Maps the real HD@EU application form (application_metadata.json —
 * confirmed structure, see NcpMetadata above) to HdeuPayload. The nested
 * application_file.zip's DOCX attachments are supporting documents (a
 * written summary/research plan) — every field this app's Application
 * model has room for is already present as structured text directly in
 * the JSON, so they aren't parsed here.
 */
function mapMetadataToHdeuPayload(meta: NcpMetadata): HdeuPayload {
  const dataset = meta.datasets[0];
  const { section2, section3, section5, section6, section8 } = meta.form;
  const cohort = section6[0];
  const { start: dataStartDate, end: dataEndDate } = parseDutchDateRange(cohort?.timePeriodOfDataExtraction);

  const purposeKey = section2.purposeForWhichDataWillBeUsed?.[0]?.key;
  const purposeCategory = (purposeKey && PURPOSE_BY_KEY[purposeKey]) || 'SCIENTIFIC_RESEARCH';

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

  return {
    hdeuApplicationId: meta.application_id,
    sendingCountry: (dataset?.country?.country_id || 'nl').toUpperCase(),
    sendingHdab: dataset?.hdab?.name || 'Unknown',
    transmissionTimestamp: meta.dateSubmitted,

    applicationType: meta.application_type,

    applicantName: section3.contactPersonName,
    applicantEmail: section3.contactPersonEmail,
    applicantOrganisation: section3.legalPersonName,

    title: meta.title,
    projectDescription: [section5.whatIsTheAimAndTopicOfTheProject, section2.summaryOfTheProject]
      .filter(Boolean)
      .join('\n\n'),
    purposeCategory,
    legalBasis: section5.legalBasis,
    requestedDatasets,
    requestedVariables,
    studyPopulation: cohort
      ? `${cohort.sizeOfTheStudyCohort} — ${cohort.howIsTheStudyCohortFormed?.value ?? ''}`.trim()
      : 'Not specified',
    inclusionCriteria: cohort?.inclusionCriteria || 'Not specified',
    exclusionCriteria: cohort?.potentialExclusionCriteria || 'Not specified',
    dataStartDate,
    dataEndDate,
    projectStartDate: section8.estimatedStartDatesForDataProcessing,
    projectEndDate: section8.estimatedEndDatesForDataProcessing,
    dataProcessingCountry: (dataset?.country?.country_id || 'nl').toUpperCase(),
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
