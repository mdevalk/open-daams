'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { readErrorMessage } from '@/lib/utils';
import type { CompletenessItem } from '@/app/api/applications/[id]/completeness-check/route';

type Props = {
  applicationId: string;
  currentUserId: string;
  canManage: boolean;
  existing: { items: CompletenessItem[]; result: string; remarks?: string | null } | null;
};

// TEHDAS2 D6.3 §5.4 / Annex 7 — representative subset of the plausibility
// checklist, mapped to the fields this application form actually collects.
const DEFAULT_ITEMS: CompletenessItem[] = [
  { key: 'title', label: 'Projectnaam is een plausibele titel (geen placeholder)', passed: false },
  { key: 'applicant', label: 'Aanvrager-/organisatiegegevens zijn compleet en plausibel', passed: false },
  { key: 'purpose', label: 'Doel van gebruik en onderbouwing zijn ingevuld', passed: false },
  { key: 'datasets', label: 'Gevraagde datasets en variabelen zijn gespecificeerd', passed: false },
  { key: 'population', label: 'Studiepopulatie en in-/exclusiecriteria zijn beschreven', passed: false },
  { key: 'legalBasis', label: 'Rechtsgrondslag is opgegeven', passed: false },
  { key: 'processingCountry', label: 'Verwerkingsland / grensoverschrijdende status is opgegeven', passed: false },
  { key: 'attachments', label: 'Vereiste bijlagen zijn aanwezig en leesbaar', passed: false },
];

const RESULT_LABELS: Record<string, string> = {
  PENDING: 'Nog niet beoordeeld',
  COMPLETE: 'Volledig',
  INCOMPLETE: 'Onvolledig',
};

const RESULT_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  COMPLETE: 'bg-emerald-100 text-emerald-700',
  INCOMPLETE: 'bg-red-100 text-red-700',
};

export function CompletenessCheckPanel({ applicationId, currentUserId, canManage, existing }: Props) {
  const router = useRouter();
  const terr = useTranslations('errors');
  const [items, setItems] = useState<CompletenessItem[]>(existing?.items ?? DEFAULT_ITEMS);
  const [result, setResult] = useState(existing?.result ?? 'PENDING');
  const [remarks, setRemarks] = useState(existing?.remarks ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allPassed = items.every((i) => i.passed);

  function toggle(key: string) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, passed: !i.passed } : i)));
  }

  async function markComplete() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/completeness-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, result: 'COMPLETE', remarks, checkedById: currentUserId }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
      setResult('COMPLETE');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : terr('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 text-sm">Volledigheidscontrole (D6.3 Ch. 5)</h2>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${RESULT_STYLES[result]}`}>
          {RESULT_LABELS[result]}
        </span>
      </div>

      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={item.passed}
              disabled={!canManage}
              onChange={() => toggle(item.key)}
              className="mt-0.5"
            />
            <span className={item.passed ? 'text-gray-700' : 'text-gray-500'}>{item.label}</span>
          </li>
        ))}
      </ul>

      <div>
        <label className="text-xs text-gray-500" htmlFor="completeness-remarks">
          Opmerkingen (optioneel)
        </label>
        <textarea
          id="completeness-remarks"
          value={remarks}
          readOnly={!canManage}
          onChange={(e) => setRemarks(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {canManage && (
        <button
          disabled={loading}
          onClick={markComplete}
          className="w-full rounded px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          Markeer als volledig
        </button>
      )}
      {canManage && !allPassed && result === 'PENDING' && (
        <p className="text-xs text-gray-400">Nog niet alle punten zijn afgevinkt.</p>
      )}
    </div>
  );
}
