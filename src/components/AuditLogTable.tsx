import { getTranslations } from 'next-intl/server';
import { AuditLog, User } from '@prisma/client';
import { formatDateTime } from '@/lib/utils';

type Entry = AuditLog & { user: Pick<User, 'name'> };

export async function AuditLogTable({ entries, locale }: { entries: Entry[]; locale: string }) {
  const t = await getTranslations({ locale, namespace: 'auditLog' });

  if (entries.length === 0) {
    return <p className="text-sm text-gray-500">{t('empty')}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            <th className="px-4 py-2 font-medium">{t('colWhen')}</th>
            <th className="px-4 py-2 font-medium">{t('colUser')}</th>
            <th className="px-4 py-2 font-medium">{t('colEntity')}</th>
            <th className="px-4 py-2 font-medium">{t('colAction')}</th>
            <th className="px-4 py-2 font-medium">{t('colComment')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-gray-100 last:border-0">
              <td className="px-4 py-2 whitespace-nowrap text-gray-500">{formatDateTime(entry.createdAt)}</td>
              <td className="px-4 py-2 whitespace-nowrap text-gray-700">{entry.user.name}</td>
              <td className="px-4 py-2 font-mono text-xs text-gray-700">{entry.entityType} &middot; {entry.entityId}</td>
              <td className="px-4 py-2 text-gray-700">{entry.action}</td>
              <td className="px-4 py-2 text-gray-700">{entry.comment ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
