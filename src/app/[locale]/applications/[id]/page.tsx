import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { StatusBadge } from '@/components/StatusBadge';
import { DeadlineBanner } from '@/components/DeadlineBanner';
import { WorkflowTimeline } from '@/components/WorkflowTimeline';
import { TransitionPanel } from '@/components/TransitionPanel';
import { NotesList } from '@/components/NotesList';
import { PermitPanel } from '@/components/PermitPanel';
import { FeeEstimatePanel } from '@/components/FeeEstimatePanel';
import { EthicalReviewPanel } from '@/components/EthicalReviewPanel';
import { AppealsPanel } from '@/components/AppealsPanel';
import { CompletenessCheckPanel } from '@/components/CompletenessCheckPanel';
import { ExtractionRequestsPanel } from '@/components/ExtractionRequestsPanel';
import { UserSwitcher } from '@/components/UserSwitcher';
import type { CompletenessItem } from '@/app/api/applications/[id]/completeness-check/route';
import { formatDate, formatDateTime, purposeLabel } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; locale: string }>;
  searchParams: Promise<{ userId?: string }>;
}) {
  const { id, locale } = await params;
  const { userId: queryUserId } = await searchParams;

  const t = await getTranslations({ locale, namespace: 'applicationDetail' });

  const [application, users] = await Promise.all([
    prisma.application.findUnique({
      where: { id },
      include: {
        applicant: true,
        caseHandler: true,
        dataPermit: true,
        feeEstimate: true,
        auditLogs: {
          include: { user: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
        notes: {
          include: { author: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: 'desc' },
        },
        documents: { orderBy: { uploadedAt: 'desc' } },
        appeals: { orderBy: { submittedAt: 'desc' } },
        completenessCheck: true,
        extractionRequests: { orderBy: { requestedAt: 'desc' } },
      },
    }),
    prisma.user.findMany({ orderBy: { name: 'asc' } }),
  ]);

  if (!application) notFound();

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
        <a href={`/${locale}/applications`} className="hover:text-gray-900">{t('breadcrumb')}</a>
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
              ? t('typeDataAccess')
              : t('typeDataRequest')}
          </p>
        </div>
        {application.status === 'DRAFT' && (
          <a
            href={`/${locale}/applications/${application.id}/edit`}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100"
          >
            {t('edit')}
          </a>
        )}
      </div>

      {/* Deadline banners */}
      <div className="space-y-2">
        {application.status !== 'DECISION_ISSUED' && application.status !== 'WITHDRAWN' && (
          <DeadlineBanner label={t('decisionDeadline')} deadline={application.decisionDeadline} />
        )}
        {application.status === 'AWAITING_ADDITIONAL_INFORMATION' && (
          <DeadlineBanner label={t('additionalInfoDeadline')} deadline={application.additionalInfoDeadline} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {['SUBMITTED', 'PRE_SCREENING'].includes(application.status) && (
            <CompletenessCheckPanel
              applicationId={application.id}
              currentUserId={currentUser.id}
              canManage={['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'].includes(currentUser.role)}
              existing={
                application.completenessCheck
                  ? {
                      items: application.completenessCheck.items as unknown as CompletenessItem[],
                      result: application.completenessCheck.result,
                    }
                  : null
              }
            />
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-4">{t('detailsTitle')}</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-gray-500">{t('applicant')}</dt>
                <dd className="font-medium">{application.applicant.name}</dd>
                <dd className="text-gray-500">{application.applicant.organisation}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{t('caseHandler')}</dt>
                <dd className="font-medium">{application.caseHandler?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{t('purpose')}</dt>
                <dd className="font-medium">{purposeLabel(application.purposeCategory)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{t('legalBasis')}</dt>
                <dd className="font-medium">{application.legalBasis || '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{t('crossBorder')}</dt>
                <dd className="font-medium">{application.isCrossBorder ? t('yes') : t('no')}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{t('processingCountry')}</dt>
                <dd className="font-medium">{application.dataProcessingCountry}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{t('dataPeriod')}</dt>
                <dd className="font-medium">
                  {formatDate(application.dataStartDate)} – {formatDate(application.dataEndDate)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">{t('projectPeriod')}</dt>
                <dd className="font-medium">
                  {formatDate(application.projectStartDate)} – {formatDate(application.projectEndDate)}
                </dd>
              </div>
              {application.submittedAt && (
                <div>
                  <dt className="text-gray-500">{t('submittedAt')}</dt>
                  <dd className="font-medium">{formatDateTime(application.submittedAt)}</dd>
                </div>
              )}
              {application.decisionOutcome && (
                <div>
                  <dt className="text-gray-500">{t('decision')}</dt>
                  <dd className={`font-semibold ${
                    application.decisionOutcome === 'POSITIVE' ? 'text-emerald-700' : 'text-red-700'
                  }`}>
                    {application.decisionOutcome === 'POSITIVE' ? t('positive') : t('negative')}
                  </dd>
                </div>
              )}
              {application.dataPermit && (
                <div>
                  <dt className="text-gray-500">{t('permitNumber')}</dt>
                  <dd className="font-medium font-mono">
                    <a href={`/${locale}/permits/${application.dataPermit.id}`} className="text-[#01689b] hover:underline">
                      {application.dataPermit.permitNumber}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-3">{t('datasetsTitle')}</h2>
            <div className="flex flex-wrap gap-2">
              {application.requestedDatasets.map((ds) => (
                <span key={ds} className="rounded-full bg-blue-50 text-blue-700 text-xs px-3 py-1 font-medium">{ds}</span>
              ))}
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('variables')}</p>
                <p className="text-gray-800">{application.requestedVariables || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('population')}</p>
                <p className="text-gray-800">{application.studyPopulation || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('inclusion')}</p>
                <p className="text-gray-800">{application.inclusionCriteria || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('exclusion')}</p>
                <p className="text-gray-800">{application.exclusionCriteria || '—'}</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-3">{t('projectTitle')}</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{application.projectDescription}</p>
          </section>

          <EthicalReviewPanel
            application={application}
            canManage={['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'].includes(currentUser.role)}
          />

          {application.decisionSummary && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900 mb-3">{t('decisionTitle')}</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{application.decisionSummary}</p>
            </section>
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-4">{t('notesTitle')}</h2>
            <NotesList applicationId={application.id} notes={application.notes} currentUser={currentUser} />
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <UserSwitcher users={users} currentUserId={currentUser.id} />
          <TransitionPanel application={application} currentUser={currentUser} />
          <FeeEstimatePanel application={application} currentUser={currentUser} />
          <PermitPanel application={application} currentUser={currentUser} />
          {application.decisionOutcome === 'POSITIVE' && (
            <ExtractionRequestsPanel
              applicationId={application.id}
              currentUserId={currentUser.id}
              requests={application.extractionRequests}
              canManage={['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'].includes(currentUser.role)}
            />
          )}
          {(application.decisionOutcome || application.appeals.length > 0) && (
            <AppealsPanel
              applicationId={application.id}
              appeals={application.appeals}
              canManage={['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'].includes(currentUser.role)}
            />
          )}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-4">{t('historyTitle')}</h2>
            <WorkflowTimeline logs={application.auditLogs} />
          </section>
        </div>
      </div>
    </div>
  );
}
