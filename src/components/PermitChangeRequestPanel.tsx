'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DataPermitStatus, PermitChangeType, PermitChangeStatus } from '@prisma/client';
import { CHANGE_STATUS_COLORS, requestableTypes } from '@/lib/permit-change';
import { formatDate, readErrorMessage } from '@/lib/utils';

type ChangeRequest = {
  id: string;
  type: PermitChangeType;
  status: PermitChangeStatus;
  justification: string;
  decisionComment: string | null;
  newValidUntil: string | Date | null;
  requestedAt: string | Date;
  decidedAt: string | Date | null;
  requestedBy: { name: string };
  decidedBy: { name: string } | null;
};

type Props = {
  permitId: string;
  permitStatus: DataPermitStatus;
  requests: ChangeRequest[];
  canRequest: boolean;
  canDecide: boolean;
  currentUserId: string;
};

const inputCls =
  'w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]';

export function PermitChangeRequestPanel({
  permitId,
  permitStatus,
  requests,
  canRequest,
  canDecide,
  currentUserId,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('permitChanges');
  const tt = useTranslations('changeType');
  const tstat = useTranslations('changeStatus');
  const terr = useTranslations('errors');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = requestableTypes(permitStatus);
  const [newType, setNewType] = useState<PermitChangeType | ''>('');
  const [justification, setJustification] = useState('');

  // Per pending request: decision inputs
  const [decideFor, setDecideFor] = useState<string | null>(null);
  const [decisionComment, setDecisionComment] = useState('');
  const [newValidUntil, setNewValidUntil] = useState('');

  async function submitRequest() {
    if (!newType) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/permits/${permitId}/change-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: newType, justification, requestedById: currentUserId }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
      setNewType('');
      setJustification('');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : terr('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  async function decide(request: ChangeRequest, decision: 'APPROVED' | 'REJECTED') {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/permits/${permitId}/change-requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          userId: currentUserId,
          comment: decisionComment || null,
          newValidUntil:
            decision === 'APPROVED' && request.type === 'RENEWAL' ? newValidUntil : undefined,
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
      const data = (await res.json().catch(() => null)) as { currentPermitId?: string } | null;
      setDecideFor(null);
      setDecisionComment('');
      setNewValidUntil('');
      // Approval issues a new permit version — navigate to it; rejection stays put.
      if (data?.currentPermitId && data.currentPermitId !== permitId) {
        router.push(pathname.replace(/[^/]+$/, data.currentPermitId));
      } else {
        router.refresh();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : terr('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded border border-gray-200 bg-white p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">{t('title')}</h3>

      {requests.length === 0 && (
        <p className="text-xs text-gray-500">{t('empty')}</p>
      )}

      {requests.map((r) => (
        <div key={r.id} className="rounded border border-gray-200 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">{tt(r.type)}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${CHANGE_STATUS_COLORS[r.status]}`}>
              {tstat(r.status)}
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-1 italic">{r.justification}</p>
          <p className="text-xs text-gray-400 mt-1">
            {t('requestedBy')} {r.requestedBy.name} · {formatDate(r.requestedAt)}
          </p>
          {r.status !== 'REQUESTED' && (
            <p className="text-xs text-gray-400">
              {tstat(r.status)} · {r.decidedBy?.name ?? '—'} · {formatDate(r.decidedAt)}
              {r.decisionComment ? ` — ${r.decisionComment}` : ''}
            </p>
          )}

          {r.status === 'REQUESTED' && canDecide && (
            <div className="mt-2">
              {decideFor === r.id ? (
                <div className="space-y-2">
                  {r.type === 'RENEWAL' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">{t('newExpiry')}</label>
                      <input type="date" value={newValidUntil} onChange={(e) => setNewValidUntil(e.target.value)} className={inputCls} />
                    </div>
                  )}
                  <textarea
                    rows={2}
                    value={decisionComment}
                    onChange={(e) => setDecisionComment(e.target.value)}
                    placeholder={t('decisionNotePlaceholder')}
                    className={inputCls}
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={loading || (r.type === 'RENEWAL' && !newValidUntil)}
                      onClick={() => decide(r, 'APPROVED')}
                      className="flex-1 rounded px-3 py-1.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {t('approve')}
                    </button>
                    <button
                      disabled={loading}
                      onClick={() => decide(r, 'REJECTED')}
                      className="flex-1 rounded px-3 py-1.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                    >
                      {t('reject')}
                    </button>
                    <button
                      disabled={loading}
                      onClick={() => setDecideFor(null)}
                      className="rounded px-3 py-1.5 text-sm border border-gray-300 hover:bg-gray-50"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setDecideFor(r.id);
                    setDecisionComment('');
                    setNewValidUntil('');
                  }}
                  className="text-xs text-[#01689b] hover:underline"
                >
                  {t('decide')}
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {canRequest && available.length > 0 && (
        <div className="border-t border-gray-200 pt-3 space-y-2">
          <p className="text-xs font-semibold text-gray-900">{t('documentNew')}</p>
          <select value={newType} onChange={(e) => setNewType(e.target.value as PermitChangeType)} className={inputCls}>
            <option value="">{t('selectType')}</option>
            {available.map((ct) => (
              <option key={ct} value={ct}>{tt(ct)}</option>
            ))}
          </select>
          <textarea
            rows={2}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder={t('justificationPlaceholder')}
            className={inputCls}
          />
          <button
            disabled={loading || !newType || !justification.trim()}
            onClick={submitRequest}
            className="w-full rounded px-3 py-2 text-sm font-semibold text-white bg-[#154273] hover:bg-[#01689b] disabled:opacity-50 transition-colors"
          >
            {loading ? t('saving') : t('submit')}
          </button>
        </div>
      )}
    </div>
  );
}
