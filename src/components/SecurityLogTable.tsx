import { getTranslations } from 'next-intl/server';
import { AuthzFailureLog } from '@prisma/client';
import { formatDateTime } from '@/lib/utils';
import { LogTable } from '@/components/LogTable';

const REASON_KEY: Record<string, string> = {
  missing_user_id: 'reasonMissingUserId',
  unknown_user: 'reasonUnknownUser',
  role_not_permitted: 'reasonRoleNotPermitted',
};

export async function SecurityLogTable({ entries, locale }: { entries: AuthzFailureLog[]; locale: string }) {
  const t = await getTranslations({ locale, namespace: 'securityLog' });

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
          key: 'reason',
          header: t('colReason'),
          render: (e) => t(REASON_KEY[e.reason] ?? 'reasonUnknown'),
          className: 'px-4 py-2 whitespace-nowrap',
        },
        {
          key: 'attemptedUserId',
          header: t('colAttemptedUserId'),
          render: (e) => e.attemptedUserId ?? '—',
          className: 'px-4 py-2 font-mono text-xs text-gray-700',
        },
        { key: 'detail', header: t('colDetail'), render: (e) => e.detail },
      ]}
    />
  );
}
