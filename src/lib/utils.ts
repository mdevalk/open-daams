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
