import { DataPermit, Application } from '@prisma/client';
import { PERMIT_STATUS_LABELS, PERMIT_STATUS_COLORS } from '@/lib/permit';
import { formatDate } from '@/lib/utils';

type Props = {
  permit: DataPermit & { application?: Pick<Application, 'referenceNumber' | 'title' | 'type'> };
  compact?: boolean;
};

const STATUS_BORDER: Record<string, string> = {
  GRANTED: 'border-emerald-400',
  AMENDED: 'border-blue-400',
  RENEWED: 'border-teal-400',
  REVOKED: 'border-red-400',
  EXPIRED: 'border-gray-300',
};

const STATUS_HEADER: Record<string, string> = {
  GRANTED: 'bg-emerald-50 border-emerald-200',
  AMENDED: 'bg-blue-50 border-blue-200',
  RENEWED: 'bg-teal-50 border-teal-200',
  REVOKED: 'bg-red-50 border-red-200',
  EXPIRED: 'bg-gray-50 border-gray-200',
};

export function PermitCard({ permit, compact }: Props) {
  const statusLabel = PERMIT_STATUS_LABELS[permit.status];
  const statusColor = PERMIT_STATUS_COLORS[permit.status];
  const borderColor = STATUS_BORDER[permit.status] ?? 'border-gray-200';
  const headerBg   = STATUS_HEADER[permit.status] ?? 'bg-gray-50 border-gray-200';

  return (
    <div className={`rounded-lg border-2 ${borderColor} bg-white overflow-hidden`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${headerBg}`}>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${statusColor}`}>
            {statusLabel}
          </span>
          <span className="font-mono text-sm font-bold text-gray-800">{permit.permitNumber}</span>
        </div>
        <div className="text-xs text-gray-500">
          Uitgegeven {formatDate(permit.issuedAt)}
        </div>
      </div>

      {/* Body */}
      <div className={`px-4 py-3 grid ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'} gap-x-6 gap-y-2 text-sm`}>
        <div>
          <p className="text-xs text-gray-500">Geldig van</p>
          <p className="font-medium">{formatDate(permit.validFrom)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Geldig tot</p>
          <p className="font-medium">{formatDate(permit.validUntil)}</p>
        </div>
        {permit.application && !compact && (
          <div>
            <p className="text-xs text-gray-500">Aanvraagnummer</p>
            <p className="font-medium font-mono">{permit.application.referenceNumber}</p>
          </div>
        )}
        {permit.previousPermitId && (
          <div className="col-span-2 sm:col-span-3">
            <p className="text-xs text-gray-500">Opvolger van</p>
            <p className="font-medium font-mono text-xs">{permit.previousPermitId}</p>
          </div>
        )}
        {permit.status === 'REVOKED' && permit.revocationReason && (
          <div className="col-span-2 sm:col-span-3">
            <p className="text-xs text-gray-500">Reden intrekking</p>
            <p className="text-red-700 text-xs">{permit.revocationReason}</p>
          </div>
        )}
      </div>
    </div>
  );
}
