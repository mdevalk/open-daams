import { useTranslations } from 'next-intl';
import { ApplicationLog, User } from '@prisma/client';
import { formatDateTime } from '@/lib/utils';

type LogEntry = ApplicationLog & { user: Pick<User, 'id' | 'name' | 'role'> };

export function WorkflowTimeline({ logs }: { logs: LogEntry[] }) {
  const t = useTranslations('workflowTimeline');
  const ts = useTranslations('applicationStatus');

  if (logs.length === 0) return <p className="text-sm text-gray-500">{t('noHistory')}</p>;

  return (
    <ol className="relative border-l border-gray-200 ml-3">
      {logs.map((log, i) => (
        <li key={log.id} className="mb-6 ml-6">
          <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-white ring-2 ring-gray-200 text-xs">
            {i + 1}
          </span>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="font-medium text-sm text-gray-900">{log.action}</p>
            {log.fromStatus && (
              <p className="text-xs text-gray-500 mt-0.5">
                {ts(log.fromStatus)} → {ts(log.toStatus)}
              </p>
            )}
            {log.comment && (
              <p className="text-sm text-gray-700 mt-1 italic">{log.comment}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              {log.user.name} &middot; {formatDateTime(log.createdAt)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
