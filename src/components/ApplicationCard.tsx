import Link from 'next/link';
import { Application, User } from '@prisma/client';
import { StatusBadge } from './StatusBadge';
import { formatDate, daysUntil } from '@/lib/utils';

type Props = {
  application: Application & {
    applicant: Pick<User, 'name' | 'organisation'>;
    caseHandler: Pick<User, 'name'> | null;
  };
};

export function ApplicationCard({ application: app }: Props) {
  const days = daysUntil(app.decisionDeadline);
  const overdue = days !== null && days < 0;
  const warning = days !== null && days >= 0 && days < 14;

  return (
    <Link href={`/applications/${app.id}`} className="block">
      <div className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-400 font-mono">{app.referenceNumber}</p>
              {app.source === 'HDEU' && (
                <span className="rounded-full bg-purple-100 text-purple-700 text-xs px-2 py-0.5 font-medium">
                  HD@EU {app.hdeuSendingCountry}
                </span>
              )}
            </div>
            <h3 className="mt-0.5 font-semibold text-gray-900 line-clamp-2">{app.title}</h3>
          </div>
          <StatusBadge status={app.status} decisionOutcome={app.decisionOutcome} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          <span>{app.type === 'DATA_ACCESS_APPLICATION' ? 'Data Permit' : 'Data Request (Art. 69)'}</span>
          <span>{app.applicant.organisation}</span>
          {app.caseHandler && <span>Handler: {app.caseHandler.name}</span>}
        </div>
        {app.decisionDeadline && (
          <div className={`mt-3 text-xs font-medium ${
            overdue ? 'text-red-600' : warning ? 'text-amber-600' : 'text-gray-400'
          }`}>
            Decision deadline: {formatDate(app.decisionDeadline)}
            {days !== null && (
              <span className="ml-1">({days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`})</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
