import { deadlineStatus, daysUntil } from '@/lib/workflow';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

function daysUntilLocal(date: Date | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

export function DeadlineBanner({
  label,
  deadline,
}: {
  label: string;
  deadline: Date | null | undefined;
}) {
  if (!deadline) return null;
  const status = deadlineStatus(deadline);
  const days = daysUntilLocal(deadline);

  const styles = {
    ok:      'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-amber-50 border-amber-300 text-amber-800',
    overdue: 'bg-red-50 border-red-300 text-red-800',
  };

  const icons = {
    ok:      '⏰',
    warning: '⚠️',
    overdue: '🔴',
  };

  return (
    <div className={cn('rounded-lg border px-4 py-3 text-sm flex items-center gap-2', styles[status!])}>
      <span>{icons[status!]}</span>
      <span>
        <span className="font-semibold">{label}:</span>{' '}
        {formatDate(deadline)}
        {days !== null && (
          <span className="ml-2">
            ({days < 0 ? `${Math.abs(days)} days overdue` : `${days} days remaining`})
          </span>
        )}
      </span>
    </div>
  );
}
