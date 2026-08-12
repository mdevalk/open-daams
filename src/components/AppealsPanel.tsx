'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { Appeal } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { formatDate, readErrorMessage } from '@/lib/utils';

type Props = {
  applicationId: string;
  appeals: Appeal[];
  canManage: boolean;
  currentUserId: string;
};

const STATUS_STYLES: Record<string, string> = {
  SUBMITTED: 'bg-amber-100 text-amber-800',
  UNDER_REVIEW: 'bg-blue-100 text-blue-700',
  UPHELD: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
  WITHDRAWN: 'bg-gray-100 text-gray-600',
};

const NEXT_STATUSES: Record<string, string[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'WITHDRAWN'],
  UNDER_REVIEW: ['UPHELD', 'REJECTED', 'WITHDRAWN'],
  UPHELD: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export function AppealsPanel({ applicationId, appeals, canManage, currentUserId }: Props) {
  const router = useRouter();
  const t = useTranslations('appealsPanel');
  const ts = useTranslations('appealStatus');
  const terr = useTranslations('errors');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [submittedBy, setSubmittedBy] = useState('');
  const [grounds, setGrounds] = useState('');
  const [authority, setAuthority] = useState('');

  async function submitAppeal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/appeals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submittedBy, grounds, authority, actingUserId: currentUserId }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
      setSubmittedBy('');
      setGrounds('');
      setAuthority('');
      setShowForm(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : terr('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(appealId: string, status: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/appeals/${appealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, actingUserId: currentUserId }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
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
        {canManage && !showForm && (
          <button onClick={() => setShowForm(true)} className="text-xs text-[#01689b] hover:underline">
            + {t('register')}
          </button>
        )}
      </div>

      {appeals.length === 0 && !showForm && (
        <p className="text-xs text-gray-500">{t('noneRegistered')}</p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="space-y-3">
        {appeals.map((appeal) => (
          <div key={appeal.id} className="border border-gray-100 rounded p-3 text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-medium">{appeal.submittedBy}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_STYLES[appeal.status]}`}>
                {ts(appeal.status)}
              </span>
            </div>
            <p className="text-gray-700 text-xs whitespace-pre-wrap">{appeal.grounds}</p>
            {appeal.authority && <p className="text-xs text-gray-500">{t('handledBy')} {appeal.authority}</p>}
            <p className="text-xs text-gray-400">{t('submittedOn')} {formatDate(appeal.submittedAt)}</p>
            {appeal.decisionSummary && (
              <p className="text-xs text-gray-700 border-t border-gray-100 pt-1 mt-1">{appeal.decisionSummary}</p>
            )}
            {canManage && NEXT_STATUSES[appeal.status]?.length > 0 && (
              <div className="flex gap-2 pt-1">
                {NEXT_STATUSES[appeal.status].map((next) => (
                  <button
                    key={next}
                    disabled={loading}
                    onClick={() => updateStatus(appeal.id, next)}
                    className="text-xs text-[#01689b] hover:underline"
                  >
                    → {ts(next)}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {canManage && showForm && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('submittedByLabel')}</label>
            <input type="text" value={submittedBy} onChange={e => setSubmittedBy(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('groundsLabel')}</label>
            <textarea rows={3} value={grounds} onChange={e => setGrounds(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('authorityLabel')}</label>
            <input type="text" value={authority} onChange={e => setAuthority(e.target.value)}
              placeholder={t('authorityPlaceholder')}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
          </div>
          <div className="flex gap-2">
            <button disabled={loading || !submittedBy.trim() || !grounds.trim()} onClick={submitAppeal}
              className="flex-1 rounded px-3 py-2 text-sm font-semibold text-white bg-[#154273] hover:bg-[#01689b] disabled:opacity-50 transition-colors">
              {loading ? t('loading') : t('register')}
            </button>
            <button disabled={loading} onClick={() => setShowForm(false)} className="rounded px-3 py-2 text-sm border border-gray-300 hover:bg-gray-50">
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
