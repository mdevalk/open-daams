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

// TEHDAS2 D6.3 Annex 5 §6.1-6.3 — one entry per country x role (cohort, its
// controls, its relatives), matching the StudyCohort model 1:1. See
// createApplicationFromHdeuPayload for how these become StudyCohort rows.
export type HdeuStudyCohort = {
  countryId: string;
  role: 'COHORT' | 'CONTROL' | 'RELATIVE';
  relatesToIndex?: number; // index into the studyCohorts array of the COHORT row this extends
  hdabContacts?: string;
  howWillDataBeLinked?: string;
  personProfileDataDate?: string;
  relationshipToSubject?: string;
  cohortFormationMethod?: 'CRITERIA' | 'PREVIOUS_COHORT' | 'COMBINED' | 'WHOLE_POPULATION';
  // Release 7 §6 — consent/permit basis (COHORT only)
  hasTheStudyCohortBeenFormedBasedOnInformationOfStudyParticipants?: boolean;
  doesTheInformedConsentCoverTheRequestedRegistryExtractions?: boolean;
  confirmThatDataPermitHasBeenGrantedForTheResearchProject?: boolean;
  howTheStudyCohortWasObtained?: string;
  detailsOfHowTheStudyCohortHasBeenFormed?: string;
  whyNeedDataOfaWholePopulation?: string;
  regionsSeekForData?: string;
  informationProviderName?: string;
  informationProviderEmail?: string;
  informationProviderPhone?: string;
  informationProviderSameAsContactPerson?: boolean;
  formedFromPriorPermit?: boolean;
  priorPermitIssuer?: string;
  priorPermitDate?: string;
  priorPermitValidFrom?: string;
  priorPermitValidTo?: string;
  priorPermitNumber?: string;
  size?: number;
  sizeIsEstimate?: boolean;
  sizeJustification?: string;
  // Relocated from the top-level HdeuPayload fields of the same name (Release
  // 7 scopes these per country) — the mapping layer mirrors the first COHORT
  // entry's values onto those top-level fields too, for backward compat
  dataSubjectsInformed?: boolean;
  dataSubjectsInformedDetail?: string;
  includesControls?: boolean;
  controlsDescription?: string;
  includesRelatives?: boolean;
  relativesDescription?: string;
  sameAsCohortData?: boolean;
  dataHolderIds?: string[];
  databaseIds?: string[];
  datasetIds?: string[];
  variablesAttachmentRef?: string;
  variablesAttachmentId?: string;
  timePeriod?: string;
  dataStartDate?: string;
  dataEndDate?: string;
  extractionMethod?: 'RANDOM_SAMPLE' | 'ALL_QUALIFYING' | 'OTHER_SAMPLE';
  sampleSize?: string;
  samplingMethodDescription?: string;
  inclusionCriteria?: string;
  exclusionCriteria?: string;
  matchingCriteria?: string;
  controlsPerCohortPerson?: string;
  willDataBeExtractedSimultaneously?: boolean;
  extractionFrequency?: 'ONCE' | 'MULTIPLE_TIMES';
  extractionInterval?: 'YEARLY' | 'HALF_YEARLY' | 'QUARTERLY' | 'OTHER';
  extractionIntervalOther?: string;
  extractionTimingNotes?: string;
  orderForExtraction?: string;
};

export type HdeuInvoicingDetails = {
  sameAsContactPerson?: boolean;
  fullName?: string;
  email?: string;
  phone?: string;
  organisationName?: string;
  address?: string;
  businessId?: string;
  vatNumber?: string;
  invoiceType?: string;
  invoiceReferenceNumber?: string;
  eInvoiceAddress?: string;
  operatorId?: string;
  peppolCode?: string;
  isProjectFinanciallyCovered?: boolean;
  financingAmountRange?: string;
  section4ProfileDataDate?: string;
};

export type HdeuAttachment = {
  field: string;
  filename: string;
  sizeBytes?: number;
  description?: string;
  content?: Buffer; // extracted from the NCP detail archive at import time; rows without it are skipped
  mimeType?: string;
};

// Release 7 §7 — otherDataPermits[], matching the RelatedDataPermit model 1:1.
export type HdeuRelatedDataPermit = {
  permitIssuer?: string;
  permitStartDateOfIssue?: string;
  permitEndDateOfIssue?: string;
  permitIdentificationInformation?: string;
};

// Release 7 Data Request §6 — tabulationPlanArray, matching the TabulationPlan
// model 1:1.
export type HdeuTabulationPlan = {
  tabulationRegisteredToBeUsed?: string;
  tabulationPossibleStudyCohort?: string;
  tabulationInformationOfRequiredVariables?: string;
  tabulationFormationVariables?: string;
  tabulationDesiredDirection?: string;
  tabulationOrderInWhichTable?: string;
  tabulationAnyOtherRelevant?: string;
};

// TEHDAS2 D6.3 Annex 5/6 §1 — the applicant's own selection of variables to
// extract, matching the DatasetVariable model 1:1.
export type HdeuDatasetVariable = {
  sourceDatasetId: string;
  name: string;
  title?: string;
  description?: string;
  datatype?: string;
  propertyUrl?: string;
};

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

  // TEHDAS2 D6.3 Annex 5/6 fields beyond the base envelope above — all
  // optional so older HdeuPayload producers (existing direct JSON imports)
  // keep working unchanged.

  // §1 — Selecting data sources (the applicant's own variable selection —
  // distinct from requestedVariables above, which summarises the EU Dataset
  // Catalogue's own variable list)
  datasetVariables?: HdeuDatasetVariable[];

  // §2 — Project
  purposeCategories?: string[];
  projectLeaderName?: string;
  projectLeaderCountry?: string;
  theResearchFocusesOnTheFollowingObjectives?: string[];
  theResearchFocusesOnTheFollowingObjectivesOther?: string;
  areaOfResearch?: string;
  areaOfResearchOther?: string;
  descriptionOfTheDataYouWillUse?: string;
  theNatureOfTheDataDoesNotLetYouProvideADescription?: boolean;
  descriptionOfTheProject?: string;
  summaryOfTheProject?: string;
  theNatureOfTheProjectDoesNotLetYouProvideASummary?: boolean;
  theNatureOfTheProjectDoesNotLetYouProvideASummaryReason?: string;

  // §3 — Applicant/contact detail
  applyingOnBehalfOfPublicSector?: boolean;
  applyingForMandatedTasks?: boolean;
  legalOrNaturalPerson?: string;
  legalOrNaturalPersonProfileDataDate?: string;
  legalPersonAddress?: string;
  legalPersonZipCode?: string;
  legalPersonCity?: string;
  legalPersonCountry?: string;
  contactPersonJobTitle?: string;
  contactPersonAffiliation?: string;
  contactPersonOrganisationName?: string;
  contactPersonRelationship?: string;
  contactPersonBusinessId?: string;
  contactPersonOperatorID?: string;
  contactPersonPhone?: string;
  contactPersonProfileDataDate?: string;

  // §4 — Invoicing
  invoicingDetails?: HdeuInvoicingDetails;

  // §5 — Purpose of data use detail
  whyDataIsNeeded?: string;
  whatIsTheAimAndTopicOfTheProject?: string;
  expectedBenefits?: string;
  applicantQualifications?: string;
  linkToTheSupportingLegalBasis?: string;
  summaryOfPlanForUsingTheDataLanguage?: string;
  summaryOfResearchPlanLanguage?: string;
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
  electronicHealthDataFormat?: string;
  pseudonymisedDataJustification?: string;
  consentCompliesWithArt6?: boolean;
  consentAssessedEthicalAspects?: boolean;

  // §6 — Study cohort / extraction scope, full fidelity (one entry per
  // country x role); see createApplicationFromHdeuPayload for how these are
  // also mirrored into the flat cohort columns below for the first entry
  studyCohorts?: HdeuStudyCohort[];
  // Flat, single-cohort-shaped fields already on Application (D6.3 §6.1,
  // shared by data access + data request) — kept for the manual-entry form
  // and mirrored from studyCohorts[0] when present
  cohortSizeIsEstimate?: boolean;
  cohortSize?: number;
  cohortSizeJustification?: string;
  cohortFormationMethod?: 'CRITERIA' | 'PREVIOUS_COHORT' | 'COMBINED' | 'WHOLE_POPULATION';
  extractionMethod?: 'RANDOM_SAMPLE' | 'ALL_QUALIFYING' | 'OTHER_SAMPLE';
  sampleSize?: string;
  samplingMethodDescription?: string;
  extractionFrequency?: 'ONCE' | 'MULTIPLE_TIMES';
  extractionInterval?: 'YEARLY' | 'HALF_YEARLY' | 'QUARTERLY' | 'OTHER';
  extractionIntervalOther?: string;
  extractionTimingNotes?: string;
  dataSubjectsInformed?: boolean;
  dataSubjectsInformedDetail?: string;
  includesControls?: boolean;
  controlsDescription?: string;
  includesRelatives?: boolean;
  relativesDescription?: string;
  usesOptOutException?: boolean;
  optOutExceptionJustification?: string;
  tabulationPlan?: string; // DATA_REQUEST only

  // §7 — Other data to be combined
  otherDataToCombine?: boolean;
  otherDataDescription?: string;
  otherDataCountries?: string[];
  otherDataHolders?: string[];
  otherDataDatabases?: string[];
  otherDataDatasets?: string[];
  otherDataCombinationMethod?: string;
  hasPendingPermitApplications?: boolean;
  pendingApplicationDate?: string;
  pendingApplicationIssuer?: string;
  pendingApplicationPermitCode?: string;
  relatedDataPermits?: HdeuRelatedDataPermit[];

  // §8 — Processing environment, transfers, protection & security
  speName?: string;
  speTechnicalRequirements?: string;
  environmentProviderName?: string;
  dataAccessTiming?: 'AS_SOON_AS_POSSIBLE' | 'LATER';
  dataAccessLaterDate?: string;
  dataAccessPeriodInfo?: string;
  dataAccessUpdateFrequency?: string;
  inactiveStoragePeriodStart?: string;
  inactiveStoragePeriodEnd?: string;
  transfersOutsideEuEea?: boolean;
  transferCountries?: string[];
  transferLegalBasis?: string;
  transferLegalArticle?: string;
  transferSafeguards?: string[];
  whyWillDataBeTransferredOutsideEUArticle47?: boolean;
  whyWillDataBeTransferredOutsideEUArticle47Options?: string[];
  whyWillDataBeTransferredOutsideEUArticle47a?: boolean;
  whyWillDataBeTransferredOutsideEUArticle47b?: boolean;
  whyWillDataBeTransferredOutsideEUArticle47c?: boolean;
  whyWillDataBeTransferredOutsideEUArticle48?: boolean;
  whyWillDataBeTransferredOutsideEUArticle48a?: boolean;
  whyWillDataBeTransferredOutsideEUArticle48b?: boolean;
  whyWillDataBeTransferredOutsideEUArticle48bOptions?: string[];
  whyWillDataBeTransferredOutsideEUArticle48c?: boolean;
  whyWillDataBeTransferredOutsideEUArticle48cOpt?: string;
  whyWillDataBeTransferredOutsideEUArticle48d?: boolean;
  whyWillDataBeTransferredOutsideEUArticle48e?: boolean;
  whyWillDataBeTransferredOutsideEUArticle49?: boolean;
  legalBasisForTransferringTheDataOutsideEU?: string;
  legalBasisForTransferringTheDataOutsideEUOtherOptions?: string[];
  safeguardsAreProvidedByReferringGDCP?: string[];
  safeguardsAreProvidedByOtherExceptionalLegalBases?: string;
  dataController?: string;
  dataMinimisationCompliance?: string;
  complyWithDataMinimisationPrincipleNotEUMember?: string;
  protectionStatement1?: boolean;
  protectionStatement2?: boolean;
  protectionStatement3?: boolean;
  protectionStatement4?: boolean;
  protectionStatement5?: boolean;
  dataProcessingPersonnel?: string[];
  lawfulnessOfProcessing?: string[];
  lawfulnessLegalBasisOther?: string;
  lawfulForProcessingPersonalData?: string[];
  europeanUnionInstitution?: string[];
  legalBasisForProcessingCombinedData?: string[];
  otherLegalBasisForProcessingCombinedData?: string;
  legalBasisForProcessingApplicationData?: string[];
  otherLegalBasisForProcessingApplicationData?: string;
  legalBasisForProcessingCombinedApplicationData?: string[];
  otherLegalBasisForProcessingCombinedApplicationData?: string;

  // §9 — Additional information + attachments (research plan, variable
  // lists, consent letters, etc.)
  additionalInformation?: string;
  attachments?: HdeuAttachment[];

  // §10 — Confirmation / consent
  consentAwareProcessingFee?: boolean;
  consentAwareChargeFee?: boolean;
  consentAwareInformationCorrect?: boolean;
  consentNoAccessToUnderlyingData?: boolean;
  consentAcceptHealthDataBody?: boolean;

  // Data Request only
  ethicalReviewInput?: string;
  whatIsTheFrequencyOfUpdates?: string;
  tabulationPlans?: HdeuTabulationPlan[];
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

  const toDate = (d?: string) => (d ? new Date(d) : null);

  // dataSubjectsInformed/includesControls/includesRelatives(+details) moved
  // to StudyCohort (per-country) — mirror the first COHORT entry when
  // studyCohorts is present, else fall back to the top-level payload fields
  // (manual entry / direct JSON import, which don't produce studyCohorts)
  const firstCohort = p.studyCohorts?.find((c) => c.role === 'COHORT');
  const mirrorCohort = <K extends keyof HdeuStudyCohort>(key: K, fallback: HdeuPayload[K & keyof HdeuPayload]) =>
    firstCohort ? firstCohort[key] : fallback;

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
      purposeCategories: p.purposeCategories ?? [],
      projectLeaderName: p.projectLeaderName,
      projectLeaderCountry: p.projectLeaderCountry,
      theResearchFocusesOnTheFollowingObjectives: p.theResearchFocusesOnTheFollowingObjectives ?? [],
      theResearchFocusesOnTheFollowingObjectivesOther: p.theResearchFocusesOnTheFollowingObjectivesOther,
      areaOfResearch: p.areaOfResearch,
      areaOfResearchOther: p.areaOfResearchOther,
      descriptionOfTheDataYouWillUse: p.descriptionOfTheDataYouWillUse,
      theNatureOfTheDataDoesNotLetYouProvideADescription: p.theNatureOfTheDataDoesNotLetYouProvideADescription,
      descriptionOfTheProject: p.descriptionOfTheProject,
      summaryOfTheProject: p.summaryOfTheProject,
      theNatureOfTheProjectDoesNotLetYouProvideASummary: p.theNatureOfTheProjectDoesNotLetYouProvideASummary,
      theNatureOfTheProjectDoesNotLetYouProvideASummaryReason: p.theNatureOfTheProjectDoesNotLetYouProvideASummaryReason,
      legalBasis: p.legalBasis,
      requestedVariables: p.requestedVariables,
      studyPopulation: p.studyPopulation,
      inclusionCriteria: p.inclusionCriteria,
      exclusionCriteria: p.exclusionCriteria,
      dataStartDate: toDate(p.dataStartDate),
      dataEndDate: toDate(p.dataEndDate),
      projectStartDate: toDate(p.projectStartDate),
      projectEndDate: toDate(p.projectEndDate),
      dataProcessingCountry: p.dataProcessingCountry,

      // §3
      applyingOnBehalfOfPublicSector: p.applyingOnBehalfOfPublicSector,
      applyingForMandatedTasks: p.applyingForMandatedTasks,
      legalOrNaturalPerson: p.legalOrNaturalPerson,
      legalOrNaturalPersonProfileDataDate: toDate(p.legalOrNaturalPersonProfileDataDate),
      legalPersonAddress: p.legalPersonAddress,
      legalPersonZipCode: p.legalPersonZipCode,
      legalPersonCity: p.legalPersonCity,
      legalPersonCountry: p.legalPersonCountry,
      contactPersonJobTitle: p.contactPersonJobTitle,
      contactPersonAffiliation: p.contactPersonAffiliation,
      contactPersonOrganisationName: p.contactPersonOrganisationName,
      contactPersonRelationship: p.contactPersonRelationship,
      contactPersonBusinessId: p.contactPersonBusinessId,
      contactPersonOperatorID: p.contactPersonOperatorID,
      contactPersonPhone: p.contactPersonPhone,
      contactPersonProfileDataDate: toDate(p.contactPersonProfileDataDate),

      // §5
      whyDataIsNeeded: p.whyDataIsNeeded,
      whatIsTheAimAndTopicOfTheProject: p.whatIsTheAimAndTopicOfTheProject,
      expectedBenefits: p.expectedBenefits,
      applicantQualifications: p.applicantQualifications,
      linkToTheSupportingLegalBasis: p.linkToTheSupportingLegalBasis,
      summaryOfPlanForUsingTheDataLanguage: p.summaryOfPlanForUsingTheDataLanguage,
      summaryOfResearchPlanLanguage: p.summaryOfResearchPlanLanguage,
      personResponsibleSameAsContactPerson: p.personResponsibleSameAsContactPerson,
      personResponsibleName: p.personResponsibleName,
      personResponsibleJobTitle: p.personResponsibleJobTitle,
      personResponsibleAffiliation: p.personResponsibleAffiliation,
      personResponsibleProfileDataDate: toDate(p.personResponsibleProfileDataDate),
      personResearchSameAsContactPerson: p.personResearchSameAsContactPerson,
      personResearchName: p.personResearchName,
      personResearchJobTitle: p.personResearchJobTitle,
      personResearchAffiliation: p.personResearchAffiliation,
      personResearchProfileDataDate: toDate(p.personResearchProfileDataDate),
      electronicHealthDataFormat: p.electronicHealthDataFormat,
      pseudonymisedDataJustification: p.pseudonymisedDataJustification,
      consentCompliesWithArt6: p.consentCompliesWithArt6,
      consentAssessedEthicalAspects: p.consentAssessedEthicalAspects,

      // §6 flat mirror (see StudyCohort rows created below for full fidelity)
      cohortSizeIsEstimate: p.cohortSizeIsEstimate,
      cohortSize: p.cohortSize,
      cohortSizeJustification: p.cohortSizeJustification,
      cohortFormationMethod: p.cohortFormationMethod,
      extractionMethod: p.extractionMethod,
      sampleSize: p.sampleSize,
      samplingMethodDescription: p.samplingMethodDescription,
      extractionFrequency: p.extractionFrequency,
      extractionInterval: p.extractionInterval,
      extractionIntervalOther: p.extractionIntervalOther,
      extractionTimingNotes: p.extractionTimingNotes,
      dataSubjectsInformed: mirrorCohort('dataSubjectsInformed', p.dataSubjectsInformed),
      dataSubjectsInformedDetail: mirrorCohort('dataSubjectsInformedDetail', p.dataSubjectsInformedDetail),
      includesControls: mirrorCohort('includesControls', p.includesControls) ?? false,
      controlsDescription: mirrorCohort('controlsDescription', p.controlsDescription),
      includesRelatives: mirrorCohort('includesRelatives', p.includesRelatives) ?? false,
      relativesDescription: mirrorCohort('relativesDescription', p.relativesDescription),
      usesOptOutException: p.usesOptOutException ?? false,
      optOutExceptionJustification: p.optOutExceptionJustification,
      tabulationPlan: p.tabulationPlan,
      ethicalReviewInput: p.ethicalReviewInput,
      whatIsTheFrequencyOfUpdates: p.whatIsTheFrequencyOfUpdates,

      // §7
      otherDataToCombine: p.otherDataToCombine ?? false,
      otherDataDescription: p.otherDataDescription,
      otherDataCountries: p.otherDataCountries ?? [],
      otherDataHolders: p.otherDataHolders ?? [],
      otherDataDatabases: p.otherDataDatabases ?? [],
      otherDataDatasets: p.otherDataDatasets ?? [],
      otherDataCombinationMethod: p.otherDataCombinationMethod,
      hasPendingPermitApplications: p.hasPendingPermitApplications,
      pendingApplicationDate: toDate(p.pendingApplicationDate),
      pendingApplicationIssuer: p.pendingApplicationIssuer,
      pendingApplicationPermitCode: p.pendingApplicationPermitCode,

      // §8
      speName: p.speName,
      speTechnicalRequirements: p.speTechnicalRequirements,
      environmentProviderName: p.environmentProviderName,
      dataAccessTiming: p.dataAccessTiming,
      dataAccessLaterDate: toDate(p.dataAccessLaterDate),
      dataAccessPeriodInfo: p.dataAccessPeriodInfo,
      dataAccessUpdateFrequency: p.dataAccessUpdateFrequency,
      inactiveStoragePeriodStart: toDate(p.inactiveStoragePeriodStart),
      inactiveStoragePeriodEnd: toDate(p.inactiveStoragePeriodEnd),
      transfersOutsideEuEea: p.transfersOutsideEuEea ?? false,
      transferCountries: p.transferCountries ?? [],
      transferLegalBasis: p.transferLegalBasis,
      transferLegalArticle: p.transferLegalArticle,
      transferSafeguards: p.transferSafeguards ?? [],
      whyWillDataBeTransferredOutsideEUArticle47: p.whyWillDataBeTransferredOutsideEUArticle47,
      whyWillDataBeTransferredOutsideEUArticle47Options: p.whyWillDataBeTransferredOutsideEUArticle47Options ?? [],
      whyWillDataBeTransferredOutsideEUArticle47a: p.whyWillDataBeTransferredOutsideEUArticle47a,
      whyWillDataBeTransferredOutsideEUArticle47b: p.whyWillDataBeTransferredOutsideEUArticle47b,
      whyWillDataBeTransferredOutsideEUArticle47c: p.whyWillDataBeTransferredOutsideEUArticle47c,
      whyWillDataBeTransferredOutsideEUArticle48: p.whyWillDataBeTransferredOutsideEUArticle48,
      whyWillDataBeTransferredOutsideEUArticle48a: p.whyWillDataBeTransferredOutsideEUArticle48a,
      whyWillDataBeTransferredOutsideEUArticle48b: p.whyWillDataBeTransferredOutsideEUArticle48b,
      whyWillDataBeTransferredOutsideEUArticle48bOptions: p.whyWillDataBeTransferredOutsideEUArticle48bOptions ?? [],
      whyWillDataBeTransferredOutsideEUArticle48c: p.whyWillDataBeTransferredOutsideEUArticle48c,
      whyWillDataBeTransferredOutsideEUArticle48cOpt: p.whyWillDataBeTransferredOutsideEUArticle48cOpt,
      whyWillDataBeTransferredOutsideEUArticle48d: p.whyWillDataBeTransferredOutsideEUArticle48d,
      whyWillDataBeTransferredOutsideEUArticle48e: p.whyWillDataBeTransferredOutsideEUArticle48e,
      whyWillDataBeTransferredOutsideEUArticle49: p.whyWillDataBeTransferredOutsideEUArticle49,
      legalBasisForTransferringTheDataOutsideEU: p.legalBasisForTransferringTheDataOutsideEU,
      legalBasisForTransferringTheDataOutsideEUOtherOptions: p.legalBasisForTransferringTheDataOutsideEUOtherOptions ?? [],
      safeguardsAreProvidedByReferringGDCP: p.safeguardsAreProvidedByReferringGDCP ?? [],
      safeguardsAreProvidedByOtherExceptionalLegalBases: p.safeguardsAreProvidedByOtherExceptionalLegalBases,
      dataController: p.dataController,
      dataMinimisationCompliance: p.dataMinimisationCompliance,
      complyWithDataMinimisationPrincipleNotEUMember: p.complyWithDataMinimisationPrincipleNotEUMember,
      protectionStatement1: p.protectionStatement1,
      protectionStatement2: p.protectionStatement2,
      protectionStatement3: p.protectionStatement3,
      protectionStatement4: p.protectionStatement4,
      protectionStatement5: p.protectionStatement5,
      dataProcessingPersonnel: p.dataProcessingPersonnel ?? [],
      lawfulnessOfProcessing: p.lawfulnessOfProcessing ?? [],
      lawfulnessLegalBasisOther: p.lawfulnessLegalBasisOther,
      lawfulForProcessingPersonalData: p.lawfulForProcessingPersonalData ?? [],
      europeanUnionInstitution: p.europeanUnionInstitution ?? [],
      legalBasisForProcessingCombinedData: p.legalBasisForProcessingCombinedData ?? [],
      otherLegalBasisForProcessingCombinedData: p.otherLegalBasisForProcessingCombinedData,
      legalBasisForProcessingApplicationData: p.legalBasisForProcessingApplicationData ?? [],
      otherLegalBasisForProcessingApplicationData: p.otherLegalBasisForProcessingApplicationData,
      legalBasisForProcessingCombinedApplicationData: p.legalBasisForProcessingCombinedApplicationData ?? [],
      otherLegalBasisForProcessingCombinedApplicationData: p.otherLegalBasisForProcessingCombinedApplicationData,

      // §9
      additionalInformation: p.additionalInformation,

      // §10
      consentAwareProcessingFee: p.consentAwareProcessingFee,
      consentAwareChargeFee: p.consentAwareChargeFee,
      consentAwareInformationCorrect: p.consentAwareInformationCorrect,
      consentNoAccessToUnderlyingData: p.consentNoAccessToUnderlyingData,
      consentAcceptHealthDataBody: p.consentAcceptHealthDataBody,

      submittedAt: now,
      decisionDeadline: calculateDecisionDeadline(now),
    },
  });

  if (p.invoicingDetails) {
    const { section4ProfileDataDate, ...invoicingData } = p.invoicingDetails;
    await prisma.applicantInvoicingDetails.create({
      data: { applicationId: application.id, ...invoicingData, section4ProfileDataDate: toDate(section4ProfileDataDate) },
    });
  }

  const attachmentsWithContent = (p.attachments ?? []).filter(
    (a): a is HdeuAttachment & { content: Buffer } => a.content !== undefined,
  );
  if (attachmentsWithContent.length > 0) {
    await prisma.attachment.createMany({
      data: attachmentsWithContent.map((a) => ({ applicationId: application.id, ...a })),
    });
  }

  if (p.datasetVariables && p.datasetVariables.length > 0) {
    await prisma.datasetVariable.createMany({
      data: p.datasetVariables.map((v) => ({ applicationId: application.id, ...v })),
    });
  }

  if (p.relatedDataPermits && p.relatedDataPermits.length > 0) {
    await prisma.relatedDataPermit.createMany({
      data: p.relatedDataPermits.map((r) => ({ applicationId: application.id, ...r })),
    });
  }

  if (p.tabulationPlans && p.tabulationPlans.length > 0) {
    await prisma.tabulationPlan.createMany({
      data: p.tabulationPlans.map((t) => ({ applicationId: application.id, ...t })),
    });
  }

  if (p.studyCohorts && p.studyCohorts.length > 0) {
    // COHORT rows first, so CONTROL/RELATIVE rows can resolve relatesToIndex
    // to a real database id via their self-relation.
    const idByIndex = new Map<number, string>();
    const cohortEntries = p.studyCohorts
      .map((c, index) => ({ c, index }))
      .filter(({ c }) => c.role === 'COHORT');
    for (const { c, index } of cohortEntries) {
      const { relatesToIndex: _relatesToIndex, ...data } = c;
      const created = await prisma.studyCohort.create({
        data: {
          applicationId: application.id,
          ...data,
          cohortFormationMethod: data.cohortFormationMethod,
          extractionMethod: data.extractionMethod,
          extractionFrequency: data.extractionFrequency,
          extractionInterval: data.extractionInterval,
          dataStartDate: toDate(data.dataStartDate),
          dataEndDate: toDate(data.dataEndDate),
          priorPermitDate: toDate(data.priorPermitDate),
          priorPermitValidFrom: toDate(data.priorPermitValidFrom),
          priorPermitValidTo: toDate(data.priorPermitValidTo),
          personProfileDataDate: toDate(data.personProfileDataDate),
        },
      });
      idByIndex.set(index, created.id);
    }
    const dependentEntries = p.studyCohorts
      .map((c, index) => ({ c, index }))
      .filter(({ c }) => c.role !== 'COHORT');
    for (const { c } of dependentEntries) {
      const { relatesToIndex, ...data } = c;
      await prisma.studyCohort.create({
        data: {
          applicationId: application.id,
          ...data,
          relatesToId: relatesToIndex !== undefined ? idByIndex.get(relatesToIndex) : undefined,
          cohortFormationMethod: data.cohortFormationMethod,
          extractionMethod: data.extractionMethod,
          extractionFrequency: data.extractionFrequency,
          extractionInterval: data.extractionInterval,
          dataStartDate: toDate(data.dataStartDate),
          dataEndDate: toDate(data.dataEndDate),
          priorPermitDate: toDate(data.priorPermitDate),
          priorPermitValidFrom: toDate(data.priorPermitValidFrom),
          priorPermitValidTo: toDate(data.priorPermitValidTo),
          personProfileDataDate: toDate(data.personProfileDataDate),
        },
      });
    }
  }

  if (p.requestedDatasets.length > 0) {
    // Same find-or-create treatment as the applicant's DataUser above —
    // incoming data holder names are free text from another HDAB, not
    // guaranteed to already exist in our registry. Batched (pre-fetch +
    // create-missing) rather than one upsert per distinct name, mirroring
    // the same pattern in applications/route.ts's POST handler.
    const distinctNames = [...new Set(p.requestedDatasets.map((g) => g.dataHolderName))];
    const existingDataHolders = await prisma.dataHolder.findMany({ where: { name: { in: distinctNames } } });
    const missingNames = distinctNames.filter((n) => !existingDataHolders.some((dh) => dh.name === n));
    if (missingNames.length > 0) {
      await prisma.dataHolder.createMany({ data: missingNames.map((name) => ({ name })), skipDuplicates: true });
    }
    const allDataHolders =
      missingNames.length > 0
        ? await prisma.dataHolder.findMany({ where: { name: { in: distinctNames } } })
        : existingDataHolders;
    const dataHolderIdsByName = new Map(allDataHolders.map((dh) => [dh.name, dh.id]));

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
