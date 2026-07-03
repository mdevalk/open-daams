import { deadlineStatus } from '@/lib/workflow';
import { formatDate } from '@/lib/utils';

function daysUntil(date: Date | null): number | null {
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
  const s = deadlineStatus(deadline);
  const days = daysUntil(deadline);
  if (!s) return null;

  const cls = {
    ok:      'deadline-ok',
    warning: 'deadline-warning',
    overdue: 'deadline-overdue',
  }[s];

  const icon = { ok: '⏰', warning: '⚠️', overdue: '🔴' }[s];

  return (
    <div className={`rounded px-4 py-3 text-sm flex items-start gap-3 ${cls}`} role="status">
      <span aria-hidden="true" className="mt-0.5">{icon}</span>
      <div>
        <span className="font-semibold">{label}</span>
        <span className="ml-2">{formatDate(deadline)}</span>
        {days !== null && (
          <span className="ml-2 text-xs">
            ({days < 0
              ? `${Math.abs(days)} dag${Math.abs(days) !== 1 ? 'en' : ''} verlopen`
              : `${days} dag${days !== 1 ? 'en' : ''} resterend`})
          </span>
        )}
      </div>
    </div>
  );
}
