import { Application } from '@prisma/client';
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/workflow';
import { cn } from '@/lib/utils';

type Props = Pick<Application, 'status' | 'decisionOutcome'>;

export function StatusBadge({ status, decisionOutcome }: Props) {
  const label =
    status === 'DECISION_ISSUED' && decisionOutcome
      ? `Decision: ${decisionOutcome.charAt(0) + decisionOutcome.slice(1).toLowerCase()}`
      : STATUS_LABELS[status];

  const color =
    status === 'DECISION_ISSUED'
      ? decisionOutcome === 'POSITIVE'
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-red-100 text-red-700'
      : STATUS_COLORS[status];

  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', color)}>
      {label}
    </span>
  );
}
