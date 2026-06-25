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
