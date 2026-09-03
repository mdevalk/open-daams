import { getTranslations } from 'next-intl/server';
import { AuditLog, User } from '@prisma/client';
import { formatDateTime } from '@/lib/utils';
import { LogTable } from '@/components/LogTable';

type Entry = AuditLog & { user: Pick<User, 'name'> };

export async function AuditLogTable({ entries, locale }: { entries: Entry[]; locale: string }) {
  const t = await getTranslations({ locale, namespace: 'auditLog' });

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
          key: 'user',
          header: t('colUser'),
          render: (e) => e.user.name,
          className: 'px-4 py-2 whitespace-nowrap text-gray-700',
        },
        {
          key: 'entity',
          header: t('colEntity'),
          render: (e) => (
            <>
              {e.entityType} &middot; {e.entityId}
            </>
          ),
          className: 'px-4 py-2 font-mono text-xs text-gray-700',
        },
        { key: 'action', header: t('colAction'), render: (e) => e.action },
        { key: 'comment', header: t('colComment'), render: (e) => e.comment ?? '—' },
      ]}
    />
  );
}
