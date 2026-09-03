import { getTranslations } from 'next-intl/server';
import { NcpIntegrationLog, Application, User } from '@prisma/client';
import { formatDateTime } from '@/lib/utils';
import { LogTable } from '@/components/LogTable';

type Entry = NcpIntegrationLog & {
  application: Pick<Application, 'id' | 'referenceNumber'> | null;
  initiatedBy: Pick<User, 'name'> | null;
};

const OUTCOME_STYLES: Record<Entry['outcome'], string> = {
  SUCCESS: 'bg-emerald-100 text-emerald-700',
  FAILURE: 'bg-red-100 text-red-700',
};

export async function IntegrationLogTable({ entries, locale }: { entries: Entry[]; locale: string }) {
  const t = await getTranslations({ locale, namespace: 'integrationLog' });

  return (
    <LogTable
      rows={entries}
      emptyMessage={t('empty')}
      columns={[
        {
          key: 'when',
          header: t('colWhen'),
          render: (e) => formatDateTime(e.createdAt),
          className: 'px-4 py-2 whitespace-nowrap text-gray-500',
        },
        {
          key: 'direction',
          header: t('colDirection'),
          render: (e) => t(e.direction === 'INBOUND' ? 'directionInbound' : 'directionOutbound'),
          className: 'px-4 py-2 whitespace-nowrap text-gray-700',
        },
        {
          key: 'operation',
          header: t('colOperation'),
          render: (e) => e.operation,
          className: 'px-4 py-2 font-mono text-xs text-gray-700',
        },
        {
          key: 'outcome',
          header: t('colOutcome'),
          render: (e) => (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_STYLES[e.outcome]}`}>
              {t(e.outcome === 'SUCCESS' ? 'outcomeSuccess' : 'outcomeFailure')}
            </span>
          ),
          className: 'px-4 py-2 whitespace-nowrap',
        },
        {
          key: 'application',
          header: t('colApplication'),
          render: (e) =>
            e.application ? (
              <a href={`/${locale}/applications/${e.application.id}`} className="text-[#01689b] hover:underline">
                {e.application.referenceNumber}
              </a>
            ) : (
              '—'
            ),
          className: 'px-4 py-2 whitespace-nowrap',
        },
        {
          key: 'initiatedBy',
          header: t('colInitiatedBy'),
          render: (e) => e.initiatedBy?.name ?? '—',
          className: 'px-4 py-2 whitespace-nowrap text-gray-700',
        },
        { key: 'error', header: t('colError'), render: (e) => e.errorMessage ?? '—' },
      ]}
    />
  );
}
