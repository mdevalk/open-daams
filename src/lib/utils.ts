import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(date),
  );
}

// Numeric DD-MM-YYYY form, used for formal documents (the permit PDF and its
// print page) — deliberately distinct from formatDate's short-month form used
// for casual in-app display.
export function formatDateNumeric(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('nl-NL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function daysUntil(date: Date | null | undefined): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

/**
 * Server Components may only pass plain objects as props to Client
 * Components. Prisma's Decimal fields (and other non-plain values) break
 * that boundary even when the receiving component never reads them, because
 * React serialises the whole prop tree. Both Decimal and Date define
 * toJSON(), so a stringify/parse round-trip converts them to plain
 * strings/numbers safely.
 */
export function serializePrisma<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data?.error ?? fallback;
  } catch {
    return fallback;
  }
}

export function purposeLabel(code: string): string {
  const map: Record<string, string> = {
    PUBLIC_HEALTH: 'Public health',
    POLICY_MAKING: 'Policy-making & regulatory',
    STATISTICS: 'Statistics',
    EDUCATION: 'Education & training',
    SCIENTIFIC_RESEARCH: 'Scientific research',
    CARE_IMPROVEMENT: 'Care improvement',
  };
  return map[code] ?? code;
}

export function cohortFormationLabel(code?: string | null): string | undefined {
  if (!code) return undefined;
  const map: Record<string, string> = {
    CRITERIA: 'Formed based on the given criteria',
    PREVIOUS_COHORT: 'An already-established cohort',
    COMBINED: 'Combination of criteria and a previously established cohort',
    WHOLE_POPULATION: 'The whole population of the indicated country/countries',
  };
  return map[code] ?? code;
}

export function extractionMethodLabel(code?: string | null): string | undefined {
  if (!code) return undefined;
  const map: Record<string, string> = {
    RANDOM_SAMPLE: 'Random sample',
    ALL_QUALIFYING: 'All the people fulfilling the criteria',
    OTHER_SAMPLE: 'Other sample',
  };
  return map[code] ?? code;
}

export function extractionFrequencyLabel(code?: string | null): string | undefined {
  if (!code) return undefined;
  const map: Record<string, string> = {
    ONCE: 'Once',
    MULTIPLE_TIMES: 'Multiple times',
  };
  return map[code] ?? code;
}

export function extractionIntervalLabel(code?: string | null): string | undefined {
  if (!code) return undefined;
  const map: Record<string, string> = {
    YEARLY: 'Yearly',
    HALF_YEARLY: 'Every six months',
    QUARTERLY: 'Quarterly',
    OTHER: 'Other',
  };
  return map[code] ?? code;
}

type Translator = (key: string, values?: Record<string, string | number | Date>) => string;

export function yesNoLabel(value: boolean | null | undefined, t: Translator): string | undefined {
  return value !== null && value !== undefined ? (value ? t('yes') : t('no')) : undefined;
}

export function populationLabel(
  row: { size: number | null; sizeIsEstimate: boolean | null },
  t: Translator,
): string | undefined {
  if (row.size === null) return undefined;
  return `${row.size}${row.sizeIsEstimate !== null ? ` (${row.sizeIsEstimate ? t('estimate') : t('exact')})` : ''}`;
}

export function dataPeriodLabel(row: {
  timePeriod: string | null;
  dataStartDate: Date | string | null;
  dataEndDate: Date | string | null;
}): string | undefined {
  return row.timePeriod || (row.dataStartDate ? `${formatDate(row.dataStartDate)} – ${formatDate(row.dataEndDate)}` : undefined);
}

export function extractionIntervalDisplay(row: {
  extractionInterval: string | null;
  extractionIntervalOther: string | null;
}): string | undefined {
  if (!row.extractionInterval) return undefined;
  return `${extractionIntervalLabel(row.extractionInterval)}${row.extractionIntervalOther ? ` — ${row.extractionIntervalOther}` : ''}`;
}

export function informationProviderLabel(
  cohort: {
    informationProviderSameAsContactPerson: boolean | null;
    informationProviderName: string | null;
    informationProviderEmail: string | null;
    informationProviderPhone: string | null;
  },
  t: Translator,
): string {
  if (cohort.informationProviderSameAsContactPerson) return t('sameAsContactPerson');
  return [cohort.informationProviderName, cohort.informationProviderEmail, cohort.informationProviderPhone]
    .filter(Boolean)
    .join(' · ');
}

export function hasBaseSectionData(cohort: {
  hdabContacts: string | null;
  howWillDataBeLinked: string | null;
  dataSubjectsInformed: boolean | null;
  hasTheStudyCohortBeenFormedBasedOnInformationOfStudyParticipants: boolean | null;
  doesTheInformedConsentCoverTheRequestedRegistryExtractions: boolean | null;
  confirmThatDataPermitHasBeenGrantedForTheResearchProject: boolean | null;
  howTheStudyCohortWasObtained: string | null;
  detailsOfHowTheStudyCohortHasBeenFormed: string | null;
  whyNeedDataOfaWholePopulation: string | null;
  regionsSeekForData: string | null;
  informationProviderName: string | null;
  informationProviderSameAsContactPerson: boolean | null;
}): boolean {
  return Boolean(
    cohort.hdabContacts ||
      cohort.howWillDataBeLinked ||
      cohort.dataSubjectsInformed !== null ||
      cohort.hasTheStudyCohortBeenFormedBasedOnInformationOfStudyParticipants !== null ||
      cohort.doesTheInformedConsentCoverTheRequestedRegistryExtractions !== null ||
      cohort.confirmThatDataPermitHasBeenGrantedForTheResearchProject !== null ||
      cohort.howTheStudyCohortWasObtained ||
      cohort.detailsOfHowTheStudyCohortHasBeenFormed ||
      cohort.whyNeedDataOfaWholePopulation ||
      cohort.regionsSeekForData ||
      cohort.informationProviderName ||
      cohort.informationProviderSameAsContactPerson,
  );
}
