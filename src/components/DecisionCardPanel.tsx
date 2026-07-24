'use client';

import { useState } from 'react';
import { Application, User } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { deadlineStatus } from '@/lib/workflow';
import { formatDate, readErrorMessage } from '@/lib/utils';

type Props = {
  application: Pick<
    Application,
    | 'id'
    | 'decisionOutcome'
    | 'decisionId'
    | 'permitAcceptanceStatus'
    | 'permitConditionsSentAt'
    | 'permitAcceptanceDeadline'
    | 'permitAcceptedAt'
    | 'negativeDecisionSentAt'
  >;
  currentUser: User;
};

const BADGE_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  overdue: 'bg-red-100 text-red-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-700',
  negative: 'bg-gray-100 text-gray-700',
};

export function DecisionCardPanel({ application, currentUser }: Props) {
  const router = useRouter();
  const t = useTranslations('decisionCardPanel');
  const terr = useTranslations('errors');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!application.decisionOutcome || !application.decisionId) return null;

  const pdfHref = `/api/applications/${application.id}/decision-card/pdf`;

  async function respond(status: 'ACCEPTED' | 'DECLINED') {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${application.id}/decision-card`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, actingUserId: currentUser.id }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : terr('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  if (application.decisionOutcome === 'NEGATIVE') {
    return (
      <div className="rounded border border-gray-200 bg-white p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm">{t('negativeTitle')}</h2>
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${BADGE_STYLES.negative}`}>
            {application.decisionId}
          </span>
        </div>
        {application.negativeDecisionSentAt && (
          <p className="text-xs text-gray-500">{t('sentAt', { date: formatDate(application.negativeDecisionSentAt) })}</p>
        )}
        <a href={pdfHref} className="text-xs text-[#01689b] hover:underline">{t('viewPdf')}</a>
      </div>
    );
  }

  // POSITIVE from here on.
  const status = application.permitAcceptanceStatus;
  if (!status) return null;

  const overdue = status === 'PENDING' && deadlineStatus(application.permitAcceptanceDeadline) === 'overdue';
  const badgeKey = status === 'PENDING' ? (overdue ? 'overdue' : 'pending') : status === 'ACCEPTED' ? 'accepted' : 'declined';

  const canRespondAsApplicant = currentUser.role === 'APPLICANT';
  const canActOnBehalf = ['CASE_HANDLER', 'ADMIN'].includes(currentUser.role);

  return (
    <div className="rounded border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 text-sm">{t('title')}</h2>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${BADGE_STYLES[badgeKey]}`}>
          {t(`status.${status}`)}
        </span>
      </div>

      <p className="text-xs text-gray-500 font-mono">{application.decisionId}</p>
      {application.permitConditionsSentAt && status === 'PENDING' && (
        <p className="text-xs text-gray-500">{t('sentAt', { date: formatDate(application.permitConditionsSentAt) })}</p>
      )}
      {application.permitAcceptedAt && status === 'ACCEPTED' && (
        <p className="text-xs text-gray-500">{t('acceptedAt', { date: formatDate(application.permitAcceptedAt) })}</p>
      )}
      <a href={pdfHref} className="block text-xs text-[#01689b] hover:underline">{t('viewPdf')}</a>

      {status === 'PENDING' && (
        <>
          {overdue && <p className="text-xs text-red-600">{t('deadlineOverdueNotice')}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-3 pt-1">
            {canRespondAsApplicant && (
              <>
                <button disabled={loading} onClick={() => respond('ACCEPTED')} className="text-xs font-medium text-emerald-700 hover:underline">
                  {t('accept')}
                </button>
                <button disabled={loading} onClick={() => respond('DECLINED')} className="text-xs font-medium text-red-700 hover:underline">
                  {t('decline')}
                </button>
              </>
            )}
            {canActOnBehalf && overdue && (
              <button disabled={loading} onClick={() => respond('DECLINED')} className="text-xs text-gray-600 hover:underline">
                {t('markNoResponse')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
