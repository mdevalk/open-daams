import { getTranslations } from 'next-intl/server';
import { AuditLog, User } from '@prisma/client';
import { formatDateTime } from '@/lib/utils';

type Entry = AuditLog & { user: Pick<User, 'name'> };

export async function ReferenceDataAuditLog({ entries, locale }: { entries: Entry[]; locale: string }) {
  const t = await getTranslations({ locale, namespace: 'referenceData' });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="font-semibold text-gray-900 text-sm mb-3">{t('recentChanges')}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">{t('noRecentChanges')}</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="text-sm">
              <p className="text-gray-900">{entry.action}</p>
              {entry.comment && (
                <p className="text-sm text-gray-700 mt-1 italic">{entry.comment}</p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">
                {entry.user.name} &middot; {formatDateTime(entry.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
