'use client';

import { useState } from 'react';
import { Application, User } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { readErrorMessage } from '@/lib/utils';

type Props = {
  application: Pick<Application, 'id' | 'status' | 'deadlineExtended' | 'deadlineExtensionReason'>;
  currentUser: User;
  /** Render as a row inside TransitionPanel's "Beschikbare acties" card instead of its own card. */
  embedded?: boolean;
};

export function DeadlineExtensionPanel({ application, currentUser, embedded }: Props) {
  const router = useRouter();
  const t = useTranslations('deadlineExtensionPanel');
  const terr = useTranslations('errors');
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (['DECISION_ISSUED', 'WITHDRAWN'].includes(application.status)) return null;

  const canManage = ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'].includes(currentUser.role);
  if (!canManage && !application.deadlineExtended) return null;

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${application.id}/extend-deadline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, actingUserId: currentUser.id }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
      setEditing(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : terr('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  const body = application.deadlineExtended ? (
    <div className={embedded ? 'rounded border border-gray-200 bg-gray-50 px-4 py-3 text-sm' : 'text-sm space-y-1'}>
      <p className="text-xs text-emerald-700 font-medium">{t('extendedLabel')}</p>
      <p className="text-xs text-gray-500 mt-0.5">{application.deadlineExtensionReason}</p>
      <p className="text-xs text-gray-400 mt-1">{t('transmittedToApplicant')}</p>
    </div>
  ) : canManage ? (
    editing ? (
      <div className="space-y-2">
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('reasonPlaceholder')}
          className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            disabled={loading || !reason.trim()}
            onClick={submit}
            className="flex-1 rounded px-3 py-2 text-sm font-semibold text-white bg-[#154273] hover:bg-[#01689b] disabled:opacity-50 transition-colors"
          >
            {loading ? t('loading') : t('confirmButton')}
          </button>
          <button
            disabled={loading}
            onClick={() => { setEditing(false); setError(null); }}
            className="rounded px-3 py-2 text-sm border border-gray-300 hover:bg-gray-50"
          >
            {t('cancelButton')}
          </button>
        </div>
      </div>
    ) : embedded ? (
      <button
        onClick={() => setEditing(true)}
        className="w-full text-left rounded border px-4 py-3 text-sm transition-colors border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-800"
      >
        <p className="font-medium">{t('extendButton')}</p>
        <p className="text-xs opacity-70 mt-0.5">{t('title')}</p>
      </button>
    ) : (
      <button onClick={() => setEditing(true)} className="text-xs text-[#01689b] hover:underline">
        {t('extendButton')}
      </button>
    )
  ) : null;

  if (embedded) return body;

  return (
    <div className="rounded border border-gray-200 bg-white p-4 space-y-2">
      <h2 className="font-semibold text-gray-900 text-sm">{t('title')}</h2>
      {body}
    </div>
  );
}
