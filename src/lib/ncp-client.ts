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

// Real archive entries are named "<attachmentId>_<filename>" (confirmed
// against a live sample), not the bare filename recorded on Attachment.filename
// — multiple real attachments can share the exact same bare filename, so
// resolution always tries "<id>_<filename>" first (Attachment.description
// holds the id). A bare-filename suffix match is the fallback for entries
// without a known id.
function matchesEntry(entryName: string, filename: string): boolean {
  return entryName === filename || entryName.endsWith(`_${filename}`) || entryName.endsWith(`/${filename}`);
}

const ATTACHMENT_CONTENT_TYPES: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pdf: 'application/pdf',
  xml: 'application/xml',
  json: 'application/json',
  txt: 'text/plain',
};

export function guessAttachmentMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return ATTACHMENT_CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/**
 * Extracts one attachment's bytes from an already-open detail archive —
 * either directly in the outer zip, or one level down inside a nested zip
 * (e.g. application_file.zip). Called once per attachment at import time
 * (see mapNcpDetailZipToHdeuPayload) so the bytes can be persisted; nothing
 * after import re-fetches from the NCP, which is a message gateway, not a
 * store.
 */
export function resolveAttachmentBytes(zip: AdmZip, ncpId: string | undefined, filename: string): Buffer | undefined {
  const target = ncpId ? `${ncpId}_${filename}` : filename;
  for (const entry of zip.getEntries()) {
    if (matchesEntry(entry.entryName, target)) return entry.getData();
    if (entry.entryName.endsWith('.zip')) {
      const nested = new AdmZip(entry.getData()).getEntries().find((ne) => matchesEntry(ne.entryName, target));
      if (nested) return nested.getData();
    }
  }
  return undefined;
}

/**
 * Thrown by mapNcpDetailZipToHdeuPayload when the metadata JSON can't be
 * parsed/mapped. Carries the raw attachment entry names found in the
 * archive (including inside a nested application_file.zip) purely for
 * diagnostics — there's no application row yet to attach them to.
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

type NcpDistributionEntry = { distribution_id: string; title: string | null };

type NcpDatasetEntry = {
  dataset_id: string;
  catalog_id?: string;
  catalog_languages?: string[];
  publisher: { name: string };
  title: Record<string, string>;
  country: { country_id: string };
  hdab: { name: string };
  variables: { titles: Record<string, string> }[];
  distributions?: NcpDistributionEntry[];
};

/** One `form.section6` entry (one country's cohort/controls/relatives scope).
 * Release 7 Tables 35-38 confirm the real form models controls/relatives as
 * name-suffixed fields on this same flat object ("...ForControls"/"Controls",
 * "...Relatives"), not separate nested objects — mirrored below. Both real
 * samples seen so far answered "No" to willControlsBeExtracted/
 * willRelativesBeExtracted, so the suffixed fields are typed from the spec
 * but not yet confirmed against a live "Yes" sample. */
type NcpSection6Entry = {
  country_id?: string;
  catalog_ids?: string[]; // observed nested here in practice, though Table 28 documents it as top-level+stripped
  hdabContacts?: string;
  howWillTheDataFromDifferentSourcesBeLinked?: string;
  personProfileDataDate?: string;
  howIsTheStudyCohortFormed?: NcpKeyValue;
  hasTheStudyCohortBeenFormedBasedOnInformationOfStudyParticipants?: NcpKeyValue;
  doesTheInformedConsentCoverTheRequestedRegistryExtractions?: NcpKeyValue;
  consentAndInformationLetterAttachment?: NcpAttachmentRef[];
  confirmThatDataPermitHasBeenGrantedForTheResearchProject?: boolean;
  idOfTheDataPermit?: string;
  permitDecisionAttachment?: NcpAttachmentRef[];
  howTheStudyCohortWasObtained?: string;
  providedInformationOfTheDataUseToCorrespondingSubjects?: NcpKeyValue;
  howProvidedInformationOfTheDataUseToCorrespondingSubjects?: string;
  whyNotProvidedInformationOfTheDataUseToCorrespondingSubjects?: string;
  detailsOfHowTheStudyCohortHasBeenFormed?: string;
  informationProviderName?: string;
  informationProviderEmail?: string;
  informationProviderPhone?: NcpPhone;
  informationProviderSameAsContactPerson?: boolean;
  whyNeedDataOfaWholePopulation?: string;
  sizeOfTheStudyCohort?: string;
  sizeOfTheStudyCohortEstimationOrExact?: NcpKeyValue; // "This is an estimation..." | "This is the exact..."
  whyNeedStudyCohortOfThisSize?: string;
  regionsSeekForData?: string;
  ethicalReviewAttachment?: NcpAttachmentRef[];
  variablesToBeUsedInDataExtractionAttachment?: NcpAttachmentRef[];
  timePeriodOfDataExtraction?: string;
  extractionMethod?: NcpKeyValue;
  samplingMethod?: string;
  sampleSize?: string;
  inclusionCriteria?: string;
  potentialExclusionCriteria?: string;
  howOftenDoesTheDataNeedToBeExtracted?: NcpKeyValue;
  needForDataExtractionEvery?: NcpKeyValue;
  needForDataExtractionEveryOther?: string;
  needForDataExtractionEveryDescription?: string;
  orderForDataExtraction?: string;
  // Data Request only (Release 7 Table 45) — nested per-country inside each
  // section6 entry, unlike the rest of the Data Request form; kept as a
  // fallback alongside form.ethicalReviewInput etc. above since the real
  // wire placement is unconfirmed.
  ethicalReviewInput?: string;
  whatIsTheFrequencyOfUpdates?: string;
  tabulationPlanArray?: NcpTabulationPlanEntry[];

  willControlsBeExtracted?: NcpKeyValue;
  willSameDataBeExtractedForControls?: NcpKeyValue;
  regionForControlsDataExtraction?: string;
  dataHoldersForControls?: string[];
  databasesForControls?: string[];
  datasetsForControls?: string[];
  variablesForDataExtraction?: string | NcpAttachmentRef[];
  timePeriodForDataExtraction?: string;
  extractionCriteriaForControls?: string;
  sizeOfControlGroup?: string;
  sizeOfControlGroupEstimationOrExact?: NcpKeyValue;
  controlsPerPersonInStudyCohort?: string;
  inclusionCriteriaForControls?: string;
  exclusionCriteriaForControls?: string;
  previouslyIssuedPermitIssuer?: string;
  previouslyIssuedPermitDate?: string;
  previouslyIssuedPermitValidityPeriodFrom?: string;
  previouslyIssuedPermitValidityPeriodTo?: string;
  previouslyIssuedPermitNumber?: string;
  willDataForControlsBeExtractedSimultaneously?: NcpKeyValue;
  dataExtractionFrequencyMultipleTimesInformation?: string;
  dataExtractionFrequency?: NcpKeyValue;
  dataNeedsToBeExtractedEvery?: NcpKeyValue;
  specifyOther?: string;
  moreInfoOnExtractionPeriods?: string;
  orderOfControlsDataExtraction?: string;
  extractionPhases?: string;

  willRelativesBeExtracted?: NcpKeyValue;
  willSameDataBeExtractedForRelatives?: NcpKeyValue;
  dataHoldersForRelatives?: string[];
  databasesForRelatives?: string[];
  datasetsForRelatives?: string[];
  variablesForDataExtractionRelatives?: string | NcpAttachmentRef[];
  timePeriodForDataExtractionRelatives?: string;
  relationshipToStudyCohort?: string;
  previouslyIssuedPermitIssuerRelatives?: string;
  sizeOfRelativesGroup?: string;
  sizeOfRelativesGroupEstimateOrExact?: NcpKeyValue;
  willDataForRelativesBeExtractedSimultaneously?: NcpKeyValue;
  dataExtractionFrequencyRelatives?: NcpKeyValue;
  dataNeedsToBeExtractedEveryRelatives?: NcpKeyValue;
  dataExtractionFrequencyMultipleTimesInformationRelatives?: string;
  specifyOtherRelatives?: string;
  moreInfoOnExtractionPeriodsRelatives?: string;
  orderOfRelativesDataExtraction?: string;
  extractionPhasesRelatives?: string;
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
  // Confirmed real wire values (Release 7 spec Table 28, confirmed against a live
  // DATA_REQUEST sample) — both suffixed with _APPLICATION, unlike DAAMS's own
  // internal ApplicationType enum (DATA_ACCESS_APPLICATION | DATA_REQUEST, no
  // suffix on the second value) — normalized via normalizeApplicationType() below.
  application_type: 'DATA_ACCESS_APPLICATION' | 'DATA_REQUEST_APPLICATION';
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
      theResearchFocusesOnTheFollowingObjectives?: NcpKeyValue[];
      theResearchFocusesOnTheFollowingObjectivesOther?: string;
      areaOfResearch?: string | NcpKeyValue;
      areaOfResearchOther?: string;
      descriptionOfTheDataYouWillUse?: string;
      theNatureOfTheDataDoesNotLetYouProvideADescription?: boolean;
      descriptionOfTheProject?: string;
      theNatureOfTheProjectDoesNotLetYouProvideASummary?: boolean;
      theNatureOfTheProjectDoesNotLetYouProvideASummaryReason?: string;
    };
    // legalOrNaturalPerson gates which branch is populated: when "Legal
    // person", legalPersonName + a separate contactPerson* block; when
    // "Natural person", the naturalPerson* fields cover both at once
    // (confirmed: both branches seen across real samples).
    section3?: {
      applyingForDataOnBehalfOfPublicSector?: NcpKeyValue;
      applyingForDataForCarryingOutTasks?: NcpKeyValue;
      legalOrNaturalPerson?: NcpKeyValue;
      legalOrNaturalPersonProfileDataDate?: string;
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
      contactPersonOperatorID?: string;
      contactPersonProfileDataDate?: string;
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
      section4ProfileDataDate?: string;
    };
    section5?: {
      whyTheDataIsNeeded?: string;
      // Data Request's own name for the same question (Release 7 Table 44) —
      // Data Access uses whyTheDataIsNeeded (Table 34); both typed, read with
      // a fallback chain since only one is ever populated per application type.
      whyAreTheDataRequested?: string;
      whatIsTheAimAndTopicOfTheProject?: string;
      whichAreTheExpectedBenefits?: string;
      describeApplicantsQualification?: string;
      legalBasis?: string;
      linkToTheSupportingLegalBasis?: string;
      summaryOfPlanForUsingTheData?: NcpAttachmentRef[];
      summaryOfPlanForUsingTheDataLanguage?: string | NcpKeyValue;
      summaryOfResearchPlan?: NcpAttachmentRef[];
      summaryOfResearchPlanLanguage?: string | NcpKeyValue;
      formatOfTheElectronicHealthData?: NcpKeyValue;
      personResponsibleSameAsContactPerson?: boolean;
      personResponsibleName?: string;
      personResponsibleJobTitle?: string;
      personResponsibleAffiliation?: string;
      personResponsibleProfileDataDate?: string;
      personResearchSameAsContactPerson?: boolean;
      personResearchName?: string;
      personResearchJobTitle?: string;
      personResearchAffiliation?: string;
      personResearchProfileDataDate?: string;
    };
    section6?: NcpSection6Entry[];
    section7?: {
      willDataBeCombinedWithDataObtained?: NcpKeyValue;
      combinedCountries?: string;
      combinedDataHolders?: string;
      combinedDatabaseRegistries?: string;
      combinedDatasetsRegistries?: string;
      providedInformationOnDataCombined?: string;
      attachmentOfPermitDocuments?: NcpAttachmentRef[];
      otherPermitApplications?: NcpKeyValue;
      dateOfSubmittingTheApplication?: string;
      applicationIssuer?: string;
      identificationCode?: string;
      otherDataPermits?: {
        permitIssuer?: string;
        permitStartDateOfIssue?: string;
        permitEndDateOfIssue?: string;
        permitIdentificationInformation?: string;
      }[];
      // Data Request's "additional information" section lives at section7
      // (Release 7 Table 46) — Data Access's equivalent is section9 (Table
      // 38). Both typed here/on section9, read with a fallback chain.
      additionalInformation?: string;
      additionalAttachment?: NcpAttachmentRef[];
    };
    section8?: {
      technicalRequirementsForEnvironment?: string;
      nameWebsiteAddressForEnvironment?: string;
      whenDataNeeded?: NcpKeyValue;
      ifLaterWhen?: string;
      informationWhichDataCanAccess?: string;
      frequencyOfAccessOrDataUpdates?: string;
      estimatedStartDatesForDataProcessing?: string;
      estimatedEndDatesForDataProcessing?: string;
      startPeriodOfInactiveDataStorage?: string;
      endPeriodOfInactiveDataStorage?: string;
      optOutOfTheMechanismProvidedInTheNationalLaw?: NcpKeyValue;
      optOutJustification?: string;
      willTheDataBeTransferred?: NcpKeyValue;
      whichCountriesDataBeProcessed?: string[];
      transferLegalArticle?: string;
      transferSafeguards?: string[];
      // Art. 47/48/49 transfer legal-basis tree (Release 7 §8) — real wire
      // shape not confirmed against a live sample yet, typed from the spec
      whyWillDataBeTransferredOutsideEUArticle47?: boolean;
      whyWillDataBeTransferredOutsideEUArticle47Options?: NcpKeyValue[];
      whyWillDataBeTransferredOutsideEUArticle47a?: boolean;
      whyWillDataBeTransferredOutsideEUArticle47b?: boolean;
      whyWillDataBeTransferredOutsideEUArticle47c?: boolean;
      whyWillDataBeTransferredOutsideEUArticle48?: boolean;
      whyWillDataBeTransferredOutsideEUArticle48a?: boolean;
      whyWillDataBeTransferredOutsideEUArticle48b?: boolean;
      whyWillDataBeTransferredOutsideEUArticle48bOptions?: NcpKeyValue[];
      whyWillDataBeTransferredOutsideEUArticle48c?: boolean;
      whyWillDataBeTransferredOutsideEUArticle48cOpt?: string | NcpKeyValue;
      whyWillDataBeTransferredOutsideEUArticle48d?: boolean;
      whyWillDataBeTransferredOutsideEUArticle48e?: boolean;
      whyWillDataBeTransferredOutsideEUArticle49?: boolean;
      legalBasisForTransferringTheDataOutsideEU?: NcpKeyValue;
      legalBasisForTransferringTheDataOutsideEUOtherOptions?: NcpKeyValue[];
      safeguardsAreProvidedByReferringGDCP?: NcpKeyValue[];
      safeguardsAreProvidedByOtherExceptionalLegalBases?: NcpKeyValue;
      whichOrganizationWillBeTheControllerOfData?: string;
      complyWithDataMinimisationPrinciple?: string;
      complyWithDataMinimisationPrincipleNotEUMember?: string;
      attachResearchPermitIfRequired?: NcpAttachmentRef[];
      peopleWhoWillBeProcessingTheData?: { fullName: string; emailAddress: string; affiliation?: string }[];
      protectionAndSecurityStatementsA?: boolean;
      protectionAndSecurityStatementsB?: boolean;
      protectionAndSecurityStatementsC?: boolean;
      protectionAndSecurityStatementsD?: boolean;
      protectionAndSecurityStatementsE?: boolean;
      legalBasisForProcessingPersonalData?: NcpKeyValue[];
      lawfulForProcessingPersonalData?: NcpKeyValue[];
      otherLegalBasisForProcessingPersonalData?: string;
      legalBasisForProcessingCombinedData?: NcpKeyValue[];
      otherLegalBasisForProcessingCombinedData?: string;
      legalBasisForProcessingApplicationData?: NcpKeyValue[];
      europeanUnionInstitution?: NcpKeyValue[];
      otherLegalBasisForProcessingApplicationData?: string;
      legalBasisForProcessingCombinedApplicationData?: NcpKeyValue[];
      otherLegalBasisForProcessingCombinedApplicationData?: string;
      hdabToRetain?: NcpKeyValue;
      // Data Request's consent section lives at section8 (Release 7 Table
      // 47) — Data Access's equivalent is section10 (Table 39). Both typed
      // here/on section10, read with a fallback chain. acceptHealthDataBody
      // has no Data Access counterpart at all.
      awareProcessingFee?: boolean;
      awareChargeFee?: boolean;
      awareInformationCorrect?: boolean;
      acceptHealthDataBody?: boolean;
    };
    section9?: {
      // Data Access's "additional information" section (Table 38) — Data
      // Request's equivalent is section7 (Table 46, see above).
      additionalInformation?: string;
      additionalAttachment?: NcpAttachmentRef[];
    };
    section10?: {
      awareProcessingFee?: boolean;
      awareChargeFee?: boolean;
      awareInformationCorrect?: boolean;
      noAccessToUnderlyingData?: boolean; // DATA_REQUEST only
    };
    // Data Request only — real wire shape not confirmed against a live
    // sample, typed from the spec. Kept as a fallback alongside the
    // per-country section6 placement below (Table 45 nests these inside
    // each section6 entry, not at the top of form) since which one the real
    // wire format uses is unconfirmed.
    ethicalReviewInput?: string;
    whatIsTheFrequencyOfUpdates?: string;
    tabulationPlanArray?: NcpTabulationPlanEntry[];
  };
};

type NcpTabulationPlanEntry = {
  tabulationRegisteredToBeUsed?: string;
  tabulationPossibleStudyCohort?: string;
  tabulationInformationOfRequiredVariables?: string;
  tabulationFormationVariables?: string;
  tabulationDesiredDirection?: string;
  tabulationOrderInWhichTable?: string;
  tabulationAnyOtherRelevant?: string;
  tabulationPlan?: NcpAttachmentRef;
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

/** DAAMS's internal ApplicationType enum has no _APPLICATION suffix on
 * DATA_REQUEST (pre-existing, used throughout permit generation/fee
 * estimates/UI) — the real wire value does have it (confirmed against a
 * live DATA_REQUEST sample), so it's normalized here rather than passed
 * through, which would otherwise fail Prisma's enum validation on create. */
function normalizeApplicationType(raw: NcpMetadata['application_type']): HdeuPayload['applicationType'] {
  return raw === 'DATA_REQUEST_APPLICATION' ? 'DATA_REQUEST' : 'DATA_ACCESS_APPLICATION';
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

/** Some §7 "combined data" fields are typed as a single string in the spec
 * (e.g. a free-text list of countries) but the local schema keeps the
 * established String[] convention for list-like fields — split on commas
 * or newlines and drop empty entries. */
function splitList(v: string | undefined): string[] | undefined {
  if (!v) return undefined;
  const parts = v
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
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

// D6.3 Annex 5 §6.1 order: a. Every year, b. Half a year, c. Quarter, d. Other
const EXTRACTION_INTERVAL_BY_KEY: Record<string, HdeuStudyCohort['extractionInterval']> = {
  a: 'YEARLY',
  b: 'HALF_YEARLY',
  c: 'QUARTERLY',
  d: 'OTHER',
};

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

function estimateFlag(v: NcpKeyValue | undefined): boolean | undefined {
  // key "a" = "This is an estimation...", key "b" = "This is the exact size..." (Annex 5 §6.1 order)
  return v ? v.key === 'a' : undefined;
}

/**
 * Maps one `form.section6` entry (one country's scope) to its COHORT row,
 * plus a CONTROL and/or RELATIVE row when the corresponding "will X be
 * extracted" flag is "Yes" — real field names confirmed against Release 7
 * Tables 35-38, though not yet against a live "Yes" sample (both real
 * samples seen so far answered "No" to both). relatesToIndex is left unset
 * here; the caller (mapMetadataToHdeuPayload) resolves it once it knows each
 * row's position in the full, cross-country studyCohorts array.
 */
function buildCohortEntry(
  entry: NcpSection6Entry,
  countryId: string,
  dataStartDate: string | undefined,
  dataEndDate: string | undefined,
): HdeuStudyCohort {
  return {
    countryId,
    role: 'COHORT',
    hdabContacts: entry.hdabContacts,
    howWillDataBeLinked: entry.howWillTheDataFromDifferentSourcesBeLinked,
    personProfileDataDate: entry.personProfileDataDate,
    cohortFormationMethod: entry.howIsTheStudyCohortFormed?.key
      ? COHORT_FORMATION_BY_KEY[entry.howIsTheStudyCohortFormed.key]
      : undefined,
    hasTheStudyCohortBeenFormedBasedOnInformationOfStudyParticipants: yesNo(
      entry.hasTheStudyCohortBeenFormedBasedOnInformationOfStudyParticipants,
    ),
    doesTheInformedConsentCoverTheRequestedRegistryExtractions: yesNo(
      entry.doesTheInformedConsentCoverTheRequestedRegistryExtractions,
    ),
    confirmThatDataPermitHasBeenGrantedForTheResearchProject: entry.confirmThatDataPermitHasBeenGrantedForTheResearchProject,
    priorPermitNumber: entry.idOfTheDataPermit,
    howTheStudyCohortWasObtained: entry.howTheStudyCohortWasObtained,
    dataSubjectsInformed: yesNo(entry.providedInformationOfTheDataUseToCorrespondingSubjects),
    dataSubjectsInformedDetail:
      entry.howProvidedInformationOfTheDataUseToCorrespondingSubjects ||
      entry.whyNotProvidedInformationOfTheDataUseToCorrespondingSubjects,
    detailsOfHowTheStudyCohortHasBeenFormed: entry.detailsOfHowTheStudyCohortHasBeenFormed,
    informationProviderName: entry.informationProviderName,
    informationProviderEmail: entry.informationProviderEmail,
    informationProviderPhone: formatPhone(entry.informationProviderPhone),
    informationProviderSameAsContactPerson: entry.informationProviderSameAsContactPerson,
    whyNeedDataOfaWholePopulation: entry.whyNeedDataOfaWholePopulation,
    size: entry.sizeOfTheStudyCohort ? parseInt(entry.sizeOfTheStudyCohort, 10) || undefined : undefined,
    sizeIsEstimate: estimateFlag(entry.sizeOfTheStudyCohortEstimationOrExact),
    sizeJustification: entry.whyNeedStudyCohortOfThisSize,
    regionsSeekForData: entry.regionsSeekForData,
    variablesAttachmentRef: entry.variablesToBeUsedInDataExtractionAttachment?.[0]?.name,
    variablesAttachmentId: entry.variablesToBeUsedInDataExtractionAttachment?.[0]?.id,
    timePeriod: entry.timePeriodOfDataExtraction,
    dataStartDate,
    dataEndDate,
    extractionMethod: mapExtractionMethod(entry.extractionMethod),
    samplingMethodDescription: entry.samplingMethod,
    sampleSize: entry.sampleSize,
    inclusionCriteria: entry.inclusionCriteria,
    exclusionCriteria: entry.potentialExclusionCriteria,
    extractionFrequency: mapExtractionFrequency(entry.howOftenDoesTheDataNeedToBeExtracted),
    extractionInterval: entry.needForDataExtractionEvery?.key
      ? EXTRACTION_INTERVAL_BY_KEY[entry.needForDataExtractionEvery.key]
      : undefined,
    extractionIntervalOther: entry.needForDataExtractionEveryOther,
    extractionTimingNotes: entry.needForDataExtractionEveryDescription,
    orderForExtraction: entry.orderForDataExtraction,
    includesControls: yesNo(entry.willControlsBeExtracted),
    includesRelatives: yesNo(entry.willRelativesBeExtracted),
  };
}

export function buildControlEntry(entry: NcpSection6Entry, countryId: string): HdeuStudyCohort | undefined {
  if (!yesNo(entry.willControlsBeExtracted)) return undefined;
  return {
    countryId,
    role: 'CONTROL',
    sameAsCohortData: yesNo(entry.willSameDataBeExtractedForControls),
    regionsSeekForData: entry.regionForControlsDataExtraction,
    dataHolderIds: entry.dataHoldersForControls,
    databaseIds: entry.databasesForControls,
    datasetIds: entry.datasetsForControls,
    timePeriod: entry.timePeriodForDataExtraction,
    variablesAttachmentRef: Array.isArray(entry.variablesForDataExtraction)
      ? entry.variablesForDataExtraction[0]?.name
      : undefined,
    variablesAttachmentId: Array.isArray(entry.variablesForDataExtraction)
      ? entry.variablesForDataExtraction[0]?.id
      : undefined,
    matchingCriteria: entry.extractionCriteriaForControls,
    size: entry.sizeOfControlGroup ? parseInt(entry.sizeOfControlGroup, 10) || undefined : undefined,
    sizeIsEstimate: estimateFlag(entry.sizeOfControlGroupEstimationOrExact),
    controlsPerCohortPerson: entry.controlsPerPersonInStudyCohort,
    inclusionCriteria: entry.inclusionCriteriaForControls,
    exclusionCriteria: entry.exclusionCriteriaForControls,
    priorPermitIssuer: entry.previouslyIssuedPermitIssuer,
    priorPermitDate: entry.previouslyIssuedPermitDate,
    priorPermitValidFrom: entry.previouslyIssuedPermitValidityPeriodFrom,
    priorPermitValidTo: entry.previouslyIssuedPermitValidityPeriodTo,
    priorPermitNumber: entry.previouslyIssuedPermitNumber,
    willDataBeExtractedSimultaneously: yesNo(entry.willDataForControlsBeExtractedSimultaneously),
    extractionTimingNotes:
      [entry.dataExtractionFrequencyMultipleTimesInformation, entry.moreInfoOnExtractionPeriods].filter(Boolean).join('\n') ||
      undefined,
    extractionFrequency: mapExtractionFrequency(entry.dataExtractionFrequency),
    extractionInterval: entry.dataNeedsToBeExtractedEvery?.key
      ? EXTRACTION_INTERVAL_BY_KEY[entry.dataNeedsToBeExtractedEvery.key]
      : undefined,
    extractionIntervalOther: entry.specifyOther,
    orderForExtraction: entry.orderOfControlsDataExtraction || entry.extractionPhases,
  };
}

export function buildRelativeEntry(entry: NcpSection6Entry, countryId: string): HdeuStudyCohort | undefined {
  if (!yesNo(entry.willRelativesBeExtracted)) return undefined;
  return {
    countryId,
    role: 'RELATIVE',
    relationshipToSubject: entry.relationshipToStudyCohort,
    sameAsCohortData: yesNo(entry.willSameDataBeExtractedForRelatives),
    dataHolderIds: entry.dataHoldersForRelatives,
    databaseIds: entry.databasesForRelatives,
    datasetIds: entry.datasetsForRelatives,
    timePeriod: entry.timePeriodForDataExtractionRelatives,
    variablesAttachmentRef: Array.isArray(entry.variablesForDataExtractionRelatives)
      ? entry.variablesForDataExtractionRelatives[0]?.name
      : undefined,
    variablesAttachmentId: Array.isArray(entry.variablesForDataExtractionRelatives)
      ? entry.variablesForDataExtractionRelatives[0]?.id
      : undefined,
    size: entry.sizeOfRelativesGroup ? parseInt(entry.sizeOfRelativesGroup, 10) || undefined : undefined,
    sizeIsEstimate: estimateFlag(entry.sizeOfRelativesGroupEstimateOrExact),
    priorPermitIssuer: entry.previouslyIssuedPermitIssuerRelatives,
    willDataBeExtractedSimultaneously: yesNo(entry.willDataForRelativesBeExtractedSimultaneously),
    extractionTimingNotes:
      [entry.dataExtractionFrequencyMultipleTimesInformationRelatives, entry.moreInfoOnExtractionPeriodsRelatives]
        .filter(Boolean)
        .join('\n') || undefined,
    extractionFrequency: mapExtractionFrequency(entry.dataExtractionFrequencyRelatives),
    extractionInterval: entry.dataNeedsToBeExtractedEveryRelatives?.key
      ? EXTRACTION_INTERVAL_BY_KEY[entry.dataNeedsToBeExtractedEveryRelatives.key]
      : undefined,
    extractionIntervalOther: entry.specifyOtherRelatives,
    orderForExtraction: entry.orderOfRelativesDataExtraction || entry.extractionPhasesRelatives,
  };
}

function mapSection6Entry(
  entry: NcpSection6Entry,
  dataProcessingCountry: string,
): { cohort: HdeuStudyCohort; control?: HdeuStudyCohort; relative?: HdeuStudyCohort } {
  const countryId = (entry.country_id || dataProcessingCountry).toUpperCase();
  const { start: dataStartDate, end: dataEndDate } = parseDutchDateRange(entry.timePeriodOfDataExtraction);

  return {
    cohort: buildCohortEntry(entry, countryId, dataStartDate, dataEndDate),
    control: buildControlEntry(entry, countryId),
    relative: buildRelativeEntry(entry, countryId),
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

/**
 * Flattens each section6 entry's {cohort, control?, relative?} into one
 * array, resolving relatesToIndex once each row's final array position is
 * known (cohort first, so control/relative can point back to it).
 */
function buildStudyCohortsFromSection6(section6: NcpSection6Entry[], dataProcessingCountry: string): HdeuStudyCohort[] {
  const studyCohorts: HdeuStudyCohort[] = [];
  for (const entry of section6) {
    const { cohort, control, relative } = mapSection6Entry(entry, dataProcessingCountry);
    const cohortIndex = studyCohorts.push(cohort) - 1;
    if (control) studyCohorts.push({ ...control, relatesToIndex: cohortIndex });
    if (relative) studyCohorts.push({ ...relative, relatesToIndex: cohortIndex });
  }
  return studyCohorts;
}

export function buildInvoicingDetails(section4: NcpMetadata['form']['section4']): HdeuInvoicingDetails | undefined {
  if (!section4) return undefined;
  return {
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
    section4ProfileDataDate: section4.section4ProfileDataDate,
  };
}

/**
 * legalOrNaturalPerson gates which branch of section3 is populated (see
 * NcpMetadata's own note) — both have been observed in real samples. Every
 * applicant/legal-person field below shares that one gate, so it's resolved
 * once here rather than repeating the same ternary at each call site.
 */
export function buildSection3Fields(section3: NonNullable<NcpMetadata['form']['section3']>) {
  const isNaturalPerson = rawText(section3.legalOrNaturalPerson)?.toLowerCase().includes('natural');
  return {
    isNaturalPerson,
    applicantName: (isNaturalPerson ? section3.naturalPersonName : section3.contactPersonName) || 'Not specified',
    applicantEmail:
      (isNaturalPerson ? section3.naturalPersonEmail : section3.contactPersonEmail) || 'unknown@unknown.invalid',
    applicantOrganisation:
      (isNaturalPerson ? section3.naturalPersonAffiliation : section3.legalPersonName) || 'Unknown',
    legalPersonAddress: isNaturalPerson ? section3.naturalPersonAddress : section3.legalPersonAddress,
    legalPersonZipCode: isNaturalPerson ? section3.naturalPersonZipCode : section3.legalPersonZipCode,
    legalPersonCity: isNaturalPerson ? section3.naturalPersonCity : section3.legalPersonCity,
    legalPersonCountry: rawText(isNaturalPerson ? section3.naturalPersonCountry : section3.legalPersonCountry),
    contactPersonAffiliation: isNaturalPerson ? section3.naturalPersonAffiliation : section3.contactPersonOrganisationName,
    contactPersonPhone: formatPhone(isNaturalPerson ? section3.naturalPersonPhone : section3.contactPersonPhone),
  };
}

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
  const section9 = form.section9 ?? {};
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
          datasets: [
            {
              name: localized(dataset.title, meta.title),
              url: null,
              datasetId: dataset.dataset_id || null,
              catalogId: dataset.catalog_id || null,
              distributions: dataset.distributions?.map((d) => ({
                distributionId: d.distribution_id,
                title: d.title ?? null,
              })),
            },
          ],
        },
      ]
    : [];

  const requestedVariables =
    dataset?.variables?.map((v) => localized(v.titles, v.titles?.[Object.keys(v.titles)[0]] ?? '')).join(', ') ||
    'Not specified';

  const studyCohorts = buildStudyCohortsFromSection6(section6, dataProcessingCountry);
  const invoicingDetails = buildInvoicingDetails(section4);
  const section3Fields = buildSection3Fields(section3);
  const { applicantName, applicantEmail, applicantOrganisation } = section3Fields;

  const attachments = [
    ...toAttachments('section5.summaryOfPlanForUsingTheData', section5.summaryOfPlanForUsingTheData),
    ...toAttachments('section5.summaryOfResearchPlan', section5.summaryOfResearchPlan),
    ...section6.flatMap((entry, i) => [
      ...toAttachments(`section6[${i}].variablesToBeUsedInDataExtractionAttachment`, entry.variablesToBeUsedInDataExtractionAttachment),
      ...toAttachments(`section6[${i}].consentAndInformationLetterAttachment`, entry.consentAndInformationLetterAttachment),
      ...toAttachments(`section6[${i}].permitDecisionAttachment`, entry.permitDecisionAttachment),
      ...toAttachments(`section6[${i}].ethicalReviewAttachment`, entry.ethicalReviewAttachment),
      ...toAttachments(
        `section6[${i}].variablesForDataExtraction`,
        Array.isArray(entry.variablesForDataExtraction) ? entry.variablesForDataExtraction : undefined,
      ),
      ...toAttachments(
        `section6[${i}].variablesForDataExtractionRelatives`,
        Array.isArray(entry.variablesForDataExtractionRelatives) ? entry.variablesForDataExtractionRelatives : undefined,
      ),
    ]),
    ...toAttachments('section7.attachmentOfPermitDocuments', section7.attachmentOfPermitDocuments),
    ...toAttachments('section8.attachResearchPermitIfRequired', section8.attachResearchPermitIfRequired),
    ...toAttachments('section9.additionalAttachment', section9.additionalAttachment ?? section7.additionalAttachment),
    ...(cohort?.tabulationPlanArray ?? form.tabulationPlanArray ?? []).flatMap((t, i) =>
      toAttachments(`tabulationPlanArray[${i}].tabulationPlan`, t.tabulationPlan ? [t.tabulationPlan] : undefined),
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

    applicationType: normalizeApplicationType(meta.application_type),

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
    legalPersonAddress: section3Fields.legalPersonAddress,
    legalPersonZipCode: section3Fields.legalPersonZipCode,
    legalPersonCity: section3Fields.legalPersonCity,
    legalPersonCountry: section3Fields.legalPersonCountry,
    contactPersonJobTitle: section3.naturalPersonJobTitle,
    contactPersonAffiliation: section3Fields.contactPersonAffiliation,
    contactPersonRelationship: section3.contactPersonRelationship,
    contactPersonBusinessId: section3.contactPersonBusinessID,
    contactPersonPhone: section3Fields.contactPersonPhone,

    // §3 (remaining)
    applyingForMandatedTasks: yesNo(section3.applyingForDataForCarryingOutTasks),
    legalOrNaturalPersonProfileDataDate: section3.legalOrNaturalPersonProfileDataDate,
    contactPersonOrganisationName: section3.contactPersonOrganisationName,
    contactPersonOperatorID: section3.contactPersonOperatorID,
    contactPersonProfileDataDate: section3.contactPersonProfileDataDate,

    // §4
    invoicingDetails,

    // §2 (remaining — placed after §4 in source order for no particular
    // reason beyond where the fields were discovered; harmless)
    theResearchFocusesOnTheFollowingObjectives: section2.theResearchFocusesOnTheFollowingObjectives?.map((v) => v.value),
    theResearchFocusesOnTheFollowingObjectivesOther: section2.theResearchFocusesOnTheFollowingObjectivesOther,
    areaOfResearch: rawText(section2.areaOfResearch),
    areaOfResearchOther: section2.areaOfResearchOther,
    descriptionOfTheDataYouWillUse: section2.descriptionOfTheDataYouWillUse,
    theNatureOfTheDataDoesNotLetYouProvideADescription: section2.theNatureOfTheDataDoesNotLetYouProvideADescription,
    descriptionOfTheProject: section2.descriptionOfTheProject,
    summaryOfTheProject: section2.summaryOfTheProject,
    theNatureOfTheProjectDoesNotLetYouProvideASummary: section2.theNatureOfTheProjectDoesNotLetYouProvideASummary,
    theNatureOfTheProjectDoesNotLetYouProvideASummaryReason: section2.theNatureOfTheProjectDoesNotLetYouProvideASummaryReason,

    // §5
    whyDataIsNeeded: section5.whyTheDataIsNeeded || section5.whyAreTheDataRequested,
    whatIsTheAimAndTopicOfTheProject: section5.whatIsTheAimAndTopicOfTheProject,
    expectedBenefits: section5.whichAreTheExpectedBenefits,
    applicantQualifications: section5.describeApplicantsQualification,
    linkToTheSupportingLegalBasis: section5.linkToTheSupportingLegalBasis,
    summaryOfPlanForUsingTheDataLanguage: rawText(section5.summaryOfPlanForUsingTheDataLanguage),
    summaryOfResearchPlanLanguage: rawText(section5.summaryOfResearchPlanLanguage),
    personResponsibleSameAsContactPerson: section5.personResponsibleSameAsContactPerson,
    personResponsibleName: section5.personResponsibleName,
    personResponsibleJobTitle: section5.personResponsibleJobTitle,
    personResponsibleAffiliation: section5.personResponsibleAffiliation,
    personResponsibleProfileDataDate: section5.personResponsibleProfileDataDate,
    personResearchSameAsContactPerson: section5.personResearchSameAsContactPerson,
    personResearchName: section5.personResearchName,
    personResearchJobTitle: section5.personResearchJobTitle,
    personResearchAffiliation: section5.personResearchAffiliation,
    personResearchProfileDataDate: section5.personResearchProfileDataDate,
    electronicHealthDataFormat: rawText(section5.formatOfTheElectronicHealthData),

    // §6 full fidelity + flat mirror of the first (COHORT, first country) entry
    studyCohorts,
    cohortSizeIsEstimate: studyCohorts[0]?.sizeIsEstimate,
    cohortSize: studyCohorts[0]?.size,
    cohortSizeJustification: studyCohorts[0]?.sizeJustification,
    cohortFormationMethod: studyCohorts[0]?.cohortFormationMethod,
    extractionMethod: studyCohorts[0]?.extractionMethod,
    extractionFrequency: studyCohorts[0]?.extractionFrequency,
    extractionInterval: studyCohorts[0]?.extractionInterval,
    extractionIntervalOther: studyCohorts[0]?.extractionIntervalOther,
    includesControls: studyCohorts[0]?.includesControls,
    includesRelatives: studyCohorts[0]?.includesRelatives,
    ethicalReviewInput: cohort?.ethicalReviewInput ?? form.ethicalReviewInput,
    whatIsTheFrequencyOfUpdates: cohort?.whatIsTheFrequencyOfUpdates ?? form.whatIsTheFrequencyOfUpdates,
    tabulationPlans: (cohort?.tabulationPlanArray ?? form.tabulationPlanArray)?.map((t) => ({
      tabulationRegisteredToBeUsed: t.tabulationRegisteredToBeUsed,
      tabulationPossibleStudyCohort: t.tabulationPossibleStudyCohort,
      tabulationInformationOfRequiredVariables: t.tabulationInformationOfRequiredVariables,
      tabulationFormationVariables: t.tabulationFormationVariables,
      tabulationDesiredDirection: t.tabulationDesiredDirection,
      tabulationOrderInWhichTable: t.tabulationOrderInWhichTable,
      tabulationAnyOtherRelevant: t.tabulationAnyOtherRelevant,
    })),

    // §7
    otherDataToCombine: yesNo(section7.willDataBeCombinedWithDataObtained),
    otherDataCountries: splitList(section7.combinedCountries),
    otherDataHolders: splitList(section7.combinedDataHolders),
    otherDataDatabases: splitList(section7.combinedDatabaseRegistries),
    otherDataDatasets: splitList(section7.combinedDatasetsRegistries),
    otherDataCombinationMethod: section7.providedInformationOnDataCombined,
    hasPendingPermitApplications: yesNo(section7.otherPermitApplications),
    pendingApplicationDate: section7.dateOfSubmittingTheApplication,
    pendingApplicationIssuer: section7.applicationIssuer,
    pendingApplicationPermitCode: section7.identificationCode,
    relatedDataPermits: section7.otherDataPermits,

    // §8
    speTechnicalRequirements: section8.technicalRequirementsForEnvironment,
    environmentProviderName: section8.nameWebsiteAddressForEnvironment,
    dataAccessTiming: mapDataAccessTiming(section8.whenDataNeeded),
    dataAccessLaterDate: section8.ifLaterWhen,
    dataAccessPeriodInfo: section8.informationWhichDataCanAccess,
    dataAccessUpdateFrequency: section8.frequencyOfAccessOrDataUpdates,
    inactiveStoragePeriodStart: section8.startPeriodOfInactiveDataStorage,
    inactiveStoragePeriodEnd: section8.endPeriodOfInactiveDataStorage,
    usesOptOutException: yesNo(section8.optOutOfTheMechanismProvidedInTheNationalLaw),
    optOutExceptionJustification: section8.optOutJustification,
    transfersOutsideEuEea: yesNo(section8.willTheDataBeTransferred),
    transferCountries: section8.whichCountriesDataBeProcessed,
    transferLegalArticle: section8.transferLegalArticle,
    transferSafeguards: section8.transferSafeguards,
    whyWillDataBeTransferredOutsideEUArticle47: section8.whyWillDataBeTransferredOutsideEUArticle47,
    whyWillDataBeTransferredOutsideEUArticle47Options: section8.whyWillDataBeTransferredOutsideEUArticle47Options?.map((v) => v.value),
    whyWillDataBeTransferredOutsideEUArticle47a: section8.whyWillDataBeTransferredOutsideEUArticle47a,
    whyWillDataBeTransferredOutsideEUArticle47b: section8.whyWillDataBeTransferredOutsideEUArticle47b,
    whyWillDataBeTransferredOutsideEUArticle47c: section8.whyWillDataBeTransferredOutsideEUArticle47c,
    whyWillDataBeTransferredOutsideEUArticle48: section8.whyWillDataBeTransferredOutsideEUArticle48,
    whyWillDataBeTransferredOutsideEUArticle48a: section8.whyWillDataBeTransferredOutsideEUArticle48a,
    whyWillDataBeTransferredOutsideEUArticle48b: section8.whyWillDataBeTransferredOutsideEUArticle48b,
    whyWillDataBeTransferredOutsideEUArticle48bOptions: section8.whyWillDataBeTransferredOutsideEUArticle48bOptions?.map((v) => v.value),
    whyWillDataBeTransferredOutsideEUArticle48c: section8.whyWillDataBeTransferredOutsideEUArticle48c,
    whyWillDataBeTransferredOutsideEUArticle48cOpt: rawText(section8.whyWillDataBeTransferredOutsideEUArticle48cOpt),
    whyWillDataBeTransferredOutsideEUArticle48d: section8.whyWillDataBeTransferredOutsideEUArticle48d,
    whyWillDataBeTransferredOutsideEUArticle48e: section8.whyWillDataBeTransferredOutsideEUArticle48e,
    whyWillDataBeTransferredOutsideEUArticle49: section8.whyWillDataBeTransferredOutsideEUArticle49,
    legalBasisForTransferringTheDataOutsideEU: rawText(section8.legalBasisForTransferringTheDataOutsideEU),
    legalBasisForTransferringTheDataOutsideEUOtherOptions: section8.legalBasisForTransferringTheDataOutsideEUOtherOptions?.map((v) => v.value),
    safeguardsAreProvidedByReferringGDCP: section8.safeguardsAreProvidedByReferringGDCP?.map((v) => v.value),
    safeguardsAreProvidedByOtherExceptionalLegalBases: rawText(section8.safeguardsAreProvidedByOtherExceptionalLegalBases),
    dataController: section8.whichOrganizationWillBeTheControllerOfData,
    dataMinimisationCompliance: section8.complyWithDataMinimisationPrinciple,
    complyWithDataMinimisationPrincipleNotEUMember: section8.complyWithDataMinimisationPrincipleNotEUMember,
    protectionStatement1: section8.protectionAndSecurityStatementsA,
    protectionStatement2: section8.protectionAndSecurityStatementsB,
    protectionStatement3: section8.protectionAndSecurityStatementsC,
    protectionStatement4: section8.protectionAndSecurityStatementsD,
    protectionStatement5: section8.protectionAndSecurityStatementsE,
    dataProcessingPersonnel: section8.peopleWhoWillBeProcessingTheData?.map(
      (p) => `${p.fullName}${p.affiliation ? ` (${p.affiliation})` : ''} <${p.emailAddress}>`,
    ),
    lawfulnessOfProcessing: section8.legalBasisForProcessingPersonalData?.map((kv) => kv.value),
    lawfulnessLegalBasisOther: section8.otherLegalBasisForProcessingPersonalData,
    lawfulForProcessingPersonalData: section8.lawfulForProcessingPersonalData?.map((v) => v.value),
    europeanUnionInstitution: section8.europeanUnionInstitution?.map((v) => v.value),
    legalBasisForProcessingCombinedData: section8.legalBasisForProcessingCombinedData?.map((v) => v.value),
    otherLegalBasisForProcessingCombinedData: section8.otherLegalBasisForProcessingCombinedData,
    legalBasisForProcessingApplicationData: section8.legalBasisForProcessingApplicationData?.map((v) => v.value),
    otherLegalBasisForProcessingApplicationData: section8.otherLegalBasisForProcessingApplicationData,
    legalBasisForProcessingCombinedApplicationData: section8.legalBasisForProcessingCombinedApplicationData?.map((v) => v.value),
    otherLegalBasisForProcessingCombinedApplicationData: section8.otherLegalBasisForProcessingCombinedApplicationData,

    // §9 (Data Access) / §7 (Data Request — Release 7 Table 46)
    additionalInformation: section9.additionalInformation || section7.additionalInformation,
    attachments,

    // §10 (Data Access) / §8 (Data Request — Release 7 Table 47)
    consentAwareProcessingFee: section10.awareProcessingFee ?? section8.awareProcessingFee,
    consentAwareChargeFee: section10.awareChargeFee ?? section8.awareChargeFee,
    consentAwareInformationCorrect: section10.awareInformationCorrect ?? section8.awareInformationCorrect,
    consentNoAccessToUnderlyingData: section10.noAccessToUnderlyingData,
    consentAcceptHealthDataBody: section8.acceptHealthDataBody,
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
    const payload = mapMetadataToHdeuPayload(meta);
    // Extract and persist attachment bytes now, while the archive is open —
    // the NCP is a message gateway, not a store, so nothing downstream
    // should need to re-fetch from it. Entries the archive doesn't actually
    // contain are dropped rather than creating an undownloadable row.
    const attachments = payload.attachments
      ?.map((a) => ({
        ...a,
        content: resolveAttachmentBytes(zip, a.description, a.filename),
        mimeType: guessAttachmentMimeType(a.filename),
      }))
      .filter((a) => {
        if (!a.content) {
          console.warn(`Attachment "${a.filename}" (${a.description ?? 'no id'}) not found in NCP detail archive; skipping`);
        }
        return Boolean(a.content);
      });
    return { ...payload, attachments };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new NcpDetailMappingError(
      `Failed to map NCP application detail: ${reason}`,
      collectAttachmentNames(zip),
    );
  }
}
