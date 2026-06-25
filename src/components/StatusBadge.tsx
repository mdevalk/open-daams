import { ApplicationStatus } from '@prisma/client';
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/workflow';
import { cn } from '@/lib/utils';

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_COLORS[status])}>
      {STATUS_LABELS[status]}
    </span>
  );
}
