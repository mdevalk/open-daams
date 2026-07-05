import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { StatusBadge } from '@/components/StatusBadge';
import { DeadlineBanner } from '@/components/DeadlineBanner';
import { WorkflowTimeline } from '@/components/WorkflowTimeline';
import { TransitionPanel } from '@/components/TransitionPanel';
import { NotesList } from '@/components/NotesList';
import { PermitPanel } from '@/components/PermitPanel';
import { UserSwitcher } from '@/components/UserSwitcher';
import { formatDate, formatDateTime, purposeLabel } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ userId?: string }>;
}) {
  const { id } = await params;
  const { userId: queryUserId } = await searchParams;

  const [application, users] = await Promise.all([
    prisma.application.findUnique({
      where: { id },
      include: {
        applicant: true,
        caseHandler: true,
        dataPermit: true,
        auditLogs: {
          include: { user: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
        notes: {
          include: { author: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: 'desc' },
        },
        documents: { orderBy: { uploadedAt: 'desc' } },
      },
    }),
    prisma.user.findMany({ orderBy: { name: 'asc' } }),
  ]);

  if (!application) notFound();

  // Prefer ?userId from query, else pick a sensible default per status
  const currentUser =
    (queryUserId ? users.find(u => u.id === queryUserId) : null) ??
    (application.status === 'PROCESSING'
      ? users.find(u => u.role === 'DECISION_MAKER')
      : null) ??
    users.find(u => u.role === 'CASE_HANDLER') ??
    users.find(u => u.role === 'DECISION_MAKER') ??
    users[0];

  if (!currentUser) notFound();

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        <a href="/applications" className="hover:text-gray-900">Aanvragen</a>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{application.referenceNumber}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">{application.title}</h1>
            <StatusBadge status={application.status} />
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {application.referenceNumber} &middot;{' '}
            {application.type === 'DATA_ACCESS_APPLICATION'
              ? 'Data-toegangsaanvraag (Art. 46)'
              : 'Dataverzoek (Art. 69)'}
          </p>
        </div>
        {application.status === 'DRAFT' && (
          <a
            href={`/applications/${application.id}/edit`}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100"
          >
            Bewerken
          </a>
        )}
      </div>

      {/* Deadline banners */}
      <div className="space-y-2">
        {application.status !== 'DECISION_ISSUED' && application.status !== 'WITHDRAWN' && (
          <DeadlineBanner label="Beslissingstermijn (Art. 46)" deadline={application.decisionDeadline} />
        )}
        {application.status === 'AWAITING_ADDITIONAL_INFORMATION' && (
          <DeadlineBanner label="Termijn aanvullende informatie" deadline={application.additionalInfoDeadline} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Aanvraaggegevens</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Aanvrager</dt>
                <dd className="font-medium">{application.applicant.name}</dd>
                <dd className="text-gray-500">{application.applicant.organisation}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Behandelaar</dt>
                <dd className="font-medium">{application.caseHandler?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Doel (Art. 34)</dt>
                <dd className="font-medium">{purposeLabel(application.purposeCategory)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Juridische grondslag</dt>
                <dd className="font-medium">{application.legalBasis || '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Grensoverschrijdend</dt>
                <dd className="font-medium">{application.isCrossBorder ? 'Ja' : 'Nee'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Verwerkingsland</dt>
                <dd className="font-medium">{application.dataProcessingCountry}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Dataperiode</dt>
                <dd className="font-medium">
                  {formatDate(application.dataStartDate)} – {formatDate(application.dataEndDate)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Projectperiode</dt>
                <dd className="font-medium">
                  {formatDate(application.projectStartDate)} – {formatDate(application.projectEndDate)}
                </dd>
              </div>
              {application.submittedAt && (
                <div>
                  <dt className="text-gray-500">Ingediend op</dt>
                  <dd className="font-medium">{formatDateTime(application.submittedAt)}</dd>
                </div>
              )}
              {application.decisionOutcome && (
                <div>
                  <dt className="text-gray-500">Besluit</dt>
                  <dd className={`font-semibold ${
                    application.decisionOutcome === 'POSITIVE' ? 'text-emerald-700' : 'text-red-700'
                  }`}>
                    {application.decisionOutcome === 'POSITIVE' ? 'Positief' : 'Negatief'}
                  </dd>
                </div>
              )}
              {application.dataPermit && (
                <div>
                  <dt className="text-gray-500">Vergunningsnummer</dt>
                  <dd className="font-medium font-mono">
                    <a href={`/permits/${application.dataPermit.id}`} className="text-[#01689b] hover:underline">
                      {application.dataPermit.permitNumber}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Gevraagde datasets</h2>
            <div className="flex flex-wrap gap-2">
              {application.requestedDatasets.map((ds) => (
                <span key={ds} className="rounded-full bg-blue-50 text-blue-700 text-xs px-3 py-1 font-medium">{ds}</span>
              ))}
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Gevraagde variabelen</p>
                <p className="text-gray-800">{application.requestedVariables || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Studiepopulatie</p>
                <p className="text-gray-800">{application.studyPopulation || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Inclusiecriteria</p>
                <p className="text-gray-800">{application.inclusionCriteria || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Exclusiecriteria</p>
                <p className="text-gray-800">{application.exclusionCriteria || '—'}</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Projectbeschrijving</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{application.projectDescription}</p>
          </section>

          {application.decisionSummary && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Besluit</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{application.decisionSummary}</p>
            </section>
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Notities</h2>
            <NotesList applicationId={application.id} notes={application.notes} currentUser={currentUser} />
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <UserSwitcher users={users} currentUserId={currentUser.id} />
          <TransitionPanel application={application} currentUser={currentUser} />
          <PermitPanel application={application} currentUser={currentUser} />
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Historie</h2>
            <WorkflowTimeline logs={application.auditLogs} />
          </section>
        </div>
      </div>
    </div>
  );
}
