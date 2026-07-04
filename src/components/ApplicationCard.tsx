import Link from 'next/link';
import { Application, User } from '@prisma/client';
import { StatusBadge } from './StatusBadge';
import { formatDate, daysUntil } from '@/lib/utils';

type Props = {
  application: Application & {
    applicant: Pick<User, 'name' | 'organisation'>;
    caseHandler: Pick<User, 'name'> | null;
  };
  locale?: string;
};

export function ApplicationCard({ application: app, locale = 'nl' }: Props) {
  const days = daysUntil(app.decisionDeadline);
  const overdue = days !== null && days < 0;
  const warning = days !== null && days >= 0 && days < 14;

  return (
    <Link href={`/${locale}/applications/${app.id}`} className="block group">
      <article className="rounded border border-gray-200 bg-white p-5 group-hover:shadow-md group-hover:border-[#01689b] transition-all">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400 font-mono">{app.referenceNumber}</span>
              {app.source === 'HDEU' && (
                <span className="rounded text-xs bg-purple-100 text-purple-700 px-2 py-0.5 font-medium border border-purple-200">
                  HD@EU • {app.hdeuSendingCountry}
                </span>
              )}
            </div>
            <h3 className="mt-1 font-semibold text-gray-900 line-clamp-2 group-hover:text-[#01689b]">
              {app.title}
            </h3>
          </div>
          <StatusBadge status={app.status} decisionOutcome={app.decisionOutcome} />
        </div>

        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          <div className="flex gap-1">
            <dt className="sr-only">Type</dt>
            <dd>{app.type === 'DATA_ACCESS_APPLICATION' ? 'Gegevenspermit' : 'Gegevensverzoek (Art. 69)'}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="sr-only">Organisatie</dt>
            <dd>{app.applicant.organisation}</dd>
          </div>
          {app.caseHandler && (
            <div className="flex gap-1">
              <dt>Behandelaar:</dt>
              <dd>{app.caseHandler.name}</dd>
            </div>
          )}
        </dl>

        {app.decisionDeadline && (
          <p className={`mt-3 text-xs font-medium ${
            overdue ? 'text-[#d52b1e]' : warning ? 'text-[#f0a500]' : 'text-gray-400'
          }`}>
            Beslisdeadline: {formatDate(app.decisionDeadline)}
            {days !== null && (
              <span className="ml-1">
                ({days < 0 ? `${Math.abs(days)}d verlopen` : `${days}d resterend`})
              </span>
            )}
          </p>
        )}
      </article>
    </Link>
  );
}
