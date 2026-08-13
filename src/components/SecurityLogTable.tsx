import { getTranslations } from 'next-intl/server';
import { AuthzFailureLog } from '@prisma/client';
import { formatDateTime } from '@/lib/utils';

const REASON_KEY: Record<string, string> = {
  missing_user_id: 'reasonMissingUserId',
  unknown_user: 'reasonUnknownUser',
  role_not_permitted: 'reasonRoleNotPermitted',
};

export async function SecurityLogTable({ entries, locale }: { entries: AuthzFailureLog[]; locale: string }) {
  const t = await getTranslations({ locale, namespace: 'securityLog' });

  if (entries.length === 0) {
    return <p className="text-sm text-gray-500">{t('empty')}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            <th className="px-4 py-2 font-medium">{t('colWhen')}</th>
            <th className="px-4 py-2 font-medium">{t('colReason')}</th>
            <th className="px-4 py-2 font-medium">{t('colAttemptedUserId')}</th>
            <th className="px-4 py-2 font-medium">{t('colDetail')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-gray-100 last:border-0">
              <td className="px-4 py-2 whitespace-nowrap text-gray-500">{formatDateTime(entry.createdAt)}</td>
              <td className="px-4 py-2 whitespace-nowrap">{t(REASON_KEY[entry.reason] ?? 'reasonUnknown')}</td>
              <td className="px-4 py-2 font-mono text-xs text-gray-700">{entry.attemptedUserId ?? '—'}</td>
              <td className="px-4 py-2 text-gray-700">{entry.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
