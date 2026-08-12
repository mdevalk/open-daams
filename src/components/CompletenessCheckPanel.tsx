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
// `key` doubles as the i18n key in the `completenessCheckPanel.items` namespace.
const DEFAULT_ITEM_KEYS = [
  'title', 'applicant', 'purpose', 'datasets', 'population', 'legalBasis', 'processingCountry', 'attachments',
] as const;

const RESULT_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  COMPLETE: 'bg-emerald-100 text-emerald-700',
  INCOMPLETE: 'bg-red-100 text-red-700',
};

export function CompletenessCheckPanel({ applicationId, currentUserId, canManage, existing }: Props) {
  const router = useRouter();
  const t = useTranslations('completenessCheckPanel');
  const terr = useTranslations('errors');
  // `existing.items[].label` is text persisted at check time — like an audit
  // log entry, it stays as recorded rather than being retranslated per
  // viewer. A fresh (not yet saved) checklist uses live-translated labels.
  const [items, setItems] = useState<CompletenessItem[]>(
    existing?.items ?? DEFAULT_ITEM_KEYS.map((key) => ({ key, label: t(`items.${key}`), passed: false })),
  );
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
        <h2 className="font-semibold text-gray-900 text-sm">{t('title')}</h2>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${RESULT_STYLES[result]}`}>
          {t(`result${result}`)}
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
          {t('remarks')}
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
          {t('markComplete')}
        </button>
      )}
      {canManage && !allPassed && result === 'PENDING' && (
        <p className="text-xs text-gray-400">{t('notAllChecked')}</p>
      )}
    </div>
  );
}
