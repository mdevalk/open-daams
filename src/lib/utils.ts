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
    SCIENTIFIC_RESEARCH: 'Scientific research',
    PUBLIC_HEALTH: 'Public health',
    POLICY_MAKING: 'Policy-making & regulatory',
    EDUCATION_TRAINING: 'Education & training',
    HEALTHCARE_DELIVERY: 'Healthcare delivery',
    PERSONALISED_MEDICINE: 'Personalised medicine',
  };
  return map[code] ?? code;
}
