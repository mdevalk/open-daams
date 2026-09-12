import type { User } from '@prisma/client';

export type DataHolderGroupState = {
  id: string;
  dataHolderId: string;
  datasets: { id: string; name: string; url: string }[];
};

export type ApplicationFormState = {
  dataHolderGroups: DataHolderGroupState[];
  decisionTrack: string;
  cohortSizeIsEstimate: string;
  extractionMethod: string;
  extractionFrequency: string;
  extractionInterval: string;
  usesOptOutException: boolean;
  cohortFormationMethod: string;
  dataSubjectsInformed: string;
  includesControls: boolean;
  includesRelatives: boolean;
  otherDataToCombine: boolean;
  dataAccessTiming: string;
  transfersOutsideEuEea: boolean;
  lawfulness: string[];
};

function whenChecked<T>(flag: boolean, value: T): T | null {
  return flag ? value : null;
}

function buildRequestedDatasets(groups: DataHolderGroupState[]) {
  return groups
    .filter((g) => g.dataHolderId)
    .map((g) => ({
      dataHolderId: g.dataHolderId,
      datasets: g.datasets.filter((d) => d.name.trim()).map((d) => ({ name: d.name.trim(), url: d.url.trim() || null })),
    }))
    .filter((g) => g.datasets.length > 0);
}

function resolveApplicantId(currentUser: Pick<User, 'id' | 'role'>, form: FormData) {
  return currentUser.role === 'APPLICANT' ? currentUser.id : form.get('applicantId');
}

function resolveDataSubjectsInformed(dataSubjectsInformed: string): boolean | null {
  return dataSubjectsInformed ? dataSubjectsInformed === 'true' : null;
}

function resolveDataAccessLaterDate(dataAccessTiming: string, form: FormData) {
  return dataAccessTiming === 'LATER' ? form.get('dataAccessLaterDate') || null : null;
}

function resolveTransferCountries(transfersOutsideEuEea: boolean, form: FormData): string[] {
  if (!transfersOutsideEuEea) return [];
  return String(form.get('transferCountries') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveExtractionInterval(extractionFrequency: string, extractionInterval: string): string | null {
  return extractionFrequency === 'MULTIPLE_TIMES' ? extractionInterval || null : null;
}

// Data access application only (Annex 5 §6.1-6.3, 7, 8)
function buildDataAccessApplicationFields(state: ApplicationFormState, form: FormData) {
  return {
    cohortFormationMethod: state.cohortFormationMethod || null,
    dataSubjectsInformed: resolveDataSubjectsInformed(state.dataSubjectsInformed),
    dataSubjectsInformedDetail: form.get('dataSubjectsInformedDetail'),
    includesControls: state.includesControls,
    controlsDescription: whenChecked(state.includesControls, form.get('controlsDescription')),
    includesRelatives: state.includesRelatives,
    relativesDescription: whenChecked(state.includesRelatives, form.get('relativesDescription')),
    otherDataToCombine: state.otherDataToCombine,
    otherDataDescription: whenChecked(state.otherDataToCombine, form.get('otherDataDescription')),
    speName: form.get('speName'),
    speTechnicalRequirements: form.get('speTechnicalRequirements'),
    dataAccessTiming: state.dataAccessTiming,
    dataAccessLaterDate: resolveDataAccessLaterDate(state.dataAccessTiming, form),
    transfersOutsideEuEea: state.transfersOutsideEuEea,
    transferCountries: resolveTransferCountries(state.transfersOutsideEuEea, form),
    transferLegalBasis: whenChecked(state.transfersOutsideEuEea, form.get('transferLegalBasis')),
    dataController: form.get('dataController'),
    lawfulnessOfProcessing: state.lawfulness,
  };
}

// Data request only (Annex 6 §6)
function buildDataRequestFields(form: FormData) {
  return { tabulationPlan: form.get('tabulationPlan') };
}

export function buildApplicationCreateBody(
  type: 'DATA_ACCESS_APPLICATION' | 'DATA_REQUEST' | '',
  currentUser: Pick<User, 'id' | 'role'>,
  form: FormData,
  state: ApplicationFormState,
) {
  return {
    actingUserId: currentUser.id,
    type: form.get('type'),
    applicantId: resolveApplicantId(currentUser, form),
    title: form.get('title'),
    projectDescription: form.get('projectDescription'),
    purposeCategory: form.get('purposeCategory'),
    requestedDatasets: buildRequestedDatasets(state.dataHolderGroups),
    requestedVariables: form.get('requestedVariables'),
    studyPopulation: form.get('studyPopulation'),
    inclusionCriteria: form.get('inclusionCriteria'),
    exclusionCriteria: form.get('exclusionCriteria'),
    dataStartDate: form.get('dataStartDate') || null,
    dataEndDate: form.get('dataEndDate') || null,
    projectStartDate: form.get('projectStartDate') || null,
    projectEndDate: form.get('projectEndDate') || null,
    legalBasis: form.get('legalBasis'),
    dataProcessingCountry: form.get('dataProcessingCountry') || 'NL',
    isCrossBorder: form.get('isCrossBorder') === 'on',
    decisionTrack: state.decisionTrack,

    // Shared cohort/extraction fields (Annex 5 §6.1 / Annex 6 §6.1)
    cohortSizeIsEstimate: state.cohortSizeIsEstimate === 'true',
    cohortSize: form.get('cohortSize') || null,
    cohortSizeJustification: form.get('cohortSizeJustification'),
    extractionMethod: state.extractionMethod || null,
    sampleSize: form.get('sampleSize'),
    samplingMethodDescription: form.get('samplingMethodDescription'),
    extractionFrequency: state.extractionFrequency || null,
    extractionInterval: resolveExtractionInterval(state.extractionFrequency, state.extractionInterval),
    extractionIntervalOther: form.get('extractionIntervalOther'),
    extractionTimingNotes: form.get('extractionTimingNotes'),

    // Opt-out exception (Annex 5 §8 / Annex 6 §6, EHDS Art. 71(4))
    usesOptOutException: state.usesOptOutException,
    optOutExceptionJustification: form.get('optOutExceptionJustification'),

    ...(type === 'DATA_ACCESS_APPLICATION' ? buildDataAccessApplicationFields(state, form) : {}),
    ...(type === 'DATA_REQUEST' ? buildDataRequestFields(form) : {}),
  };
}
