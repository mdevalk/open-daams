import { Application } from '@prisma/client';
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/workflow';
import { cn } from '@/lib/utils';

type Props = Pick<Application, 'status' | 'decisionOutcome'>;

// NL Design System status badge — uses Rijkshuisstijl color tokens
const NL_STATUS_COLORS: Record<string, string> = {
  DRAFT:                           'bg-gray-100 text-gray-700 border border-gray-300',
  SUBMITTED:                       'bg-[#e8f4fb] text-[#154273] border border-[#01689b]',
  PRE_SCREENING:                   'bg-[#fff3cd] text-[#6b4c00] border border-[#f0a500]',
  AWAITING_ADDITIONAL_INFORMATION: 'bg-[#fff3cd] text-[#6b4c00] border border-[#f0a500]',
  PROCESSING:                      'bg-[#e8f4fb] text-[#154273] border border-[#01689b]',
  DECISION_ISSUED:                 'bg-[#e6f5ea] text-[#1a5c2e] border border-[#39870c]',
  WITHDRAWN:                       'bg-gray-100 text-gray-500 border border-gray-300',
};

export function StatusBadge({ status, decisionOutcome }: Props) {
  const label =
    status === 'DECISION_ISSUED' && decisionOutcome
      ? `Besluit: ${decisionOutcome === 'POSITIVE' ? 'Positief' : 'Negatief'}`
      : STATUS_LABELS[status];

  const color =
    status === 'DECISION_ISSUED'
      ? decisionOutcome === 'POSITIVE'
        ? 'bg-[#e6f5ea] text-[#1a5c2e] border border-[#39870c]'
        : 'bg-[#fce8e6] text-[#7a1711] border border-[#d52b1e]'
      : NL_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700';

  return (
    <span className={cn('status-badge', color)}>
      {label}
    </span>
  );
}
