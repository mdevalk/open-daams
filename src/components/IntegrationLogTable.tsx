import { getTranslations } from 'next-intl/server';
import { NcpIntegrationLog, Application, User } from '@prisma/client';
import { formatDateTime } from '@/lib/utils';

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

  if (entries.length === 0) {
    return <p className="text-sm text-gray-500">{t('empty')}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            <th className="px-4 py-2 font-medium">{t('colWhen')}</th>
            <th className="px-4 py-2 font-medium">{t('colDirection')}</th>
            <th className="px-4 py-2 font-medium">{t('colOperation')}</th>
            <th className="px-4 py-2 font-medium">{t('colOutcome')}</th>
            <th className="px-4 py-2 font-medium">{t('colApplication')}</th>
            <th className="px-4 py-2 font-medium">{t('colInitiatedBy')}</th>
            <th className="px-4 py-2 font-medium">{t('colError')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-gray-100 last:border-0">
              <td className="px-4 py-2 whitespace-nowrap text-gray-500">{formatDateTime(entry.createdAt)}</td>
              <td className="px-4 py-2 whitespace-nowrap text-gray-700">
                {t(entry.direction === 'INBOUND' ? 'directionInbound' : 'directionOutbound')}
              </td>
              <td className="px-4 py-2 font-mono text-xs text-gray-700">{entry.operation}</td>
              <td className="px-4 py-2 whitespace-nowrap">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_STYLES[entry.outcome]}`}>
                  {t(entry.outcome === 'SUCCESS' ? 'outcomeSuccess' : 'outcomeFailure')}
                </span>
              </td>
              <td className="px-4 py-2 whitespace-nowrap">
                {entry.application ? (
                  <a href={`/${locale}/applications/${entry.application.id}`} className="text-[#01689b] hover:underline">
                    {entry.application.referenceNumber}
                  </a>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-4 py-2 whitespace-nowrap text-gray-700">{entry.initiatedBy?.name ?? '—'}</td>
              <td className="px-4 py-2 text-gray-700">{entry.errorMessage ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
