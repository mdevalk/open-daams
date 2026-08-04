import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { StatusBadge } from '@/components/StatusBadge';
import { DeadlineBanner } from '@/components/DeadlineBanner';
import { WorkflowTimeline } from '@/components/WorkflowTimeline';
import { TransitionPanel } from '@/components/TransitionPanel';
import { NotesList } from '@/components/NotesList';
import { PermitPanel } from '@/components/PermitPanel';
import { DecisionCardPanel } from '@/components/DecisionCardPanel';
import { FeeEstimatePanel } from '@/components/FeeEstimatePanel';
import { EthicalReviewPanel } from '@/components/EthicalReviewPanel';
import { AppealsPanel } from '@/components/AppealsPanel';
import { CompletenessCheckPanel } from '@/components/CompletenessCheckPanel';
import { ExtractionRequestsPanel } from '@/components/ExtractionRequestsPanel';
import { UserSwitcher } from '@/components/UserSwitcher';
import { StudyCohortExplorer } from '@/components/StudyCohortExplorer';
import type { CompletenessItem } from '@/app/api/applications/[id]/completeness-check/route';
import { formatDate, formatDateTime, purposeLabel, serializePrisma } from '@/lib/utils';
import { formatPermitId } from '@/lib/permit';
import { groupDatasetsByHolder } from '@/lib/permit-signing';

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

  const [rawApplication, users, dataHolders] = await Promise.all([
    prisma.application.findUnique({
      where: { id },
      include: {
        applicant: { include: { dataUser: { select: { name: true } } } },
        dataPermits: { where: { isCurrent: true } },
        feeEstimate: { include: { invoice: true } },
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
        extractionRequests: {
          include: { dataHolder: { select: { name: true } } },
          orderBy: { requestedAt: 'desc' },
        },
        requestedDatasets: {
          include: { dataHolder: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        },
        studyCohorts: { orderBy: { countryId: 'asc' } },
        invoicingDetails: true,
        attachments: { orderBy: { field: 'asc' } },
        datasetVariables: { orderBy: { name: 'asc' } },
      },
    }),
    prisma.user.findMany({ orderBy: { name: 'asc' } }),
    prisma.dataHolder.findMany({ orderBy: { name: 'asc' } }),
  ]);

  if (!rawApplication) notFound();

  // FeeEstimate/DataPermit carry Prisma Decimal fields, which the RSC
  // boundary can't serialise when passed to the client panels below.
  const application = serializePrisma(rawApplication);
  // One current permit version per application (D6.4 §9.3 version chain).
  const currentPermit = application.dataPermits[0] ?? null;

  // Attachment bytes aren't stored in DAAMS — resolved on demand via the NCP
  // detail archive using the sending application's own id, which is only
  // available for HD@EU-sourced applications.
  const attachmentHref = (filename: string) =>
    `/api/import/ncp-applications/${application.hdeuApplicationId}/attachments/${encodeURIComponent(filename)}`;

  const cohortRows = application.studyCohorts.filter((c) => c.role === 'COHORT');

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
            <StatusBadge status={application.status} decisionOutcome={application.decisionOutcome} />
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {application.referenceNumber} &middot;{' '}
            {application.type === 'DATA_ACCESS_APPLICATION'
              ? t('typeDataAccess')
              : t('typeDataRequest')}
            {application.hdeuApplicationId && (
              <>
                {' '}
                &middot; {t('hdeuApplicationId')}: <span className="font-mono">{application.hdeuApplicationId}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Deadline banners */}
      <div className="space-y-2">
        {application.status !== 'DECISION_ISSUED' && application.status !== 'WITHDRAWN' && (
          <DeadlineBanner label={t('decisionDeadline')} deadline={application.decisionDeadline} />
        )}
        {application.status === 'AWAITING_ADDITIONAL_INFORMATION' && (
          <DeadlineBanner label={t('additionalInfoDeadline')} deadline={application.additionalInfoDeadline} />
        )}
        {application.status === 'DECISION_ISSUED' && application.permitAcceptanceStatus === 'PENDING' && (
          <DeadlineBanner label={t('permitAcceptanceDeadline')} deadline={application.permitAcceptanceDeadline} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {application.status === 'PRE_SCREENING' && (
            <CompletenessCheckPanel
              applicationId={application.id}
              currentUserId={currentUser.id}
              canManage={['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'].includes(currentUser.role)}
              existing={
                application.completenessCheck
                  ? {
                      items: application.completenessCheck.items as unknown as CompletenessItem[],
                      result: application.completenessCheck.result,
                      remarks: application.completenessCheck.remarks,
                    }
                  : null
              }
            />
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-4">{t('caseManagementTitle')}</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-gray-500">{t('applicationType')}</dt>
                <dd className="font-medium">
                  {application.type === 'DATA_ACCESS_APPLICATION' ? t('typeDataAccess') : t('typeDataRequest')}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">{t('status')}</dt>
                <dd className="font-medium">
                  <StatusBadge status={application.status} decisionOutcome={application.decisionOutcome} />
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">{t('applicant')}</dt>
                <dd className="font-medium">{application.applicant.name}</dd>
              </div>
              {application.submittedAt && (
                <div>
                  <dt className="text-gray-500">{t('submittedAt')}</dt>
                  <dd className="font-medium">{formatDateTime(application.submittedAt)}</dd>
                </div>
              )}
              {application.decisionDeadline && (
                <div className="sm:col-start-2">
                  <dt className="text-gray-500">{t('decisionDeadlineDate')}</dt>
                  <dd className="font-medium">{formatDate(application.decisionDeadline)}</dd>
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
              {currentPermit && (
                <div>
                  <dt className="text-gray-500">{t('permitNumber')}</dt>
                  <dd className="font-medium font-mono">
                    <a href={`/${locale}/permits/${currentPermit.id}`} className="text-[#01689b] hover:underline">
                      {formatPermitId(currentPermit.permitNumber, currentPermit.version)}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {application.datasetVariables.length > 0 && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900 mb-3">{t('section1Title')}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 text-xs uppercase tracking-wide border-b border-gray-200">
                      <th className="py-1.5 pr-4 font-medium">{t('variables')}</th>
                      <th className="py-1.5 pr-4 font-medium">{t('datatype')}</th>
                      <th className="py-1.5 font-medium">{t('description')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {application.datasetVariables.map((v) => (
                      <tr key={v.id} className="border-b border-gray-100 last:border-0 align-top">
                        <td className="py-2 pr-4 font-medium text-gray-900">{v.name}</td>
                        <td className="py-2 pr-4 text-gray-800">{v.datatype || '—'}</td>
                        <td className="py-2 text-gray-800">
                          {v.title || v.description || '—'}
                          {v.propertyUrl && (
                            <a
                              href={v.propertyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-xs text-blue-600 hover:underline break-all"
                            >
                              {v.propertyUrl}
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-3">{t('section2Title')}</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">{t('projectName')}</dt>
                <dd className="font-medium">{application.title}</dd>
              </div>
              {application.projectLeaderName && (
                <div>
                  <dt className="text-gray-500">{t('projectLeader')}</dt>
                  <dd className="font-medium">{application.projectLeaderName}</dd>
                </div>
              )}
              {application.projectLeaderCountry && (
                <div>
                  <dt className="text-gray-500">{t('projectLeaderCountry')}</dt>
                  <dd className="font-medium">{application.projectLeaderCountry}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500 mb-1">{t('purpose')}</dt>
                {application.purposeCategories.length > 0 ? (
                  <ul className="space-y-1">
                    {application.purposeCategories.map((code) => (
                      <li key={code} className="flex items-start gap-2 font-medium">
                        <span className="text-emerald-600 mt-0.5">✓</span>
                        <span>{purposeLabel(code)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="font-medium">{purposeLabel(application.purposeCategory)}</p>
                )}
              </div>
              <div>
                <dt className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('projectDescription')}</dt>
                <dd className="text-gray-800 whitespace-pre-wrap">{application.projectDescription}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-3">{t('section3Title')}</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-gray-500">{t('applicant')}</dt>
                <dd className="font-medium">{application.applicant.name}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{t('contactEmail')}</dt>
                <dd className="font-medium">{application.applicant.email}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{t('organisation')}</dt>
                <dd className="font-medium">{application.applicant.dataUser?.name ?? '—'}</dd>
              </div>
            </dl>
          </section>

          {application.invoicingDetails && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900 mb-3">{t('section4Title')}</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                {application.invoicingDetails.fullName && (
                  <div>
                    <dt className="text-gray-500">{t('applicant')}</dt>
                    <dd className="font-medium">{application.invoicingDetails.fullName}</dd>
                  </div>
                )}
                {application.invoicingDetails.email && (
                  <div>
                    <dt className="text-gray-500">{t('contactEmail')}</dt>
                    <dd className="font-medium">{application.invoicingDetails.email}</dd>
                  </div>
                )}
                {application.invoicingDetails.organisationName && (
                  <div>
                    <dt className="text-gray-500">{t('organisation')}</dt>
                    <dd className="font-medium">{application.invoicingDetails.organisationName}</dd>
                  </div>
                )}
                {application.invoicingDetails.invoiceType && (
                  <div>
                    <dt className="text-gray-500">{t('invoiceType')}</dt>
                    <dd className="font-medium">{application.invoicingDetails.invoiceType}</dd>
                  </div>
                )}
                {application.invoicingDetails.vatNumber && (
                  <div>
                    <dt className="text-gray-500">{t('vatNumber')}</dt>
                    <dd className="font-medium">{application.invoicingDetails.vatNumber}</dd>
                  </div>
                )}
                {application.invoicingDetails.isProjectFinanciallyCovered !== null && (
                  <div>
                    <dt className="text-gray-500">{t('financiallyCovered')}</dt>
                    <dd className="font-medium">
                      {application.invoicingDetails.isProjectFinanciallyCovered ? t('yes') : t('no')}
                    </dd>
                  </div>
                )}
                {application.invoicingDetails.financingAmountRange && (
                  <div>
                    <dt className="text-gray-500">{t('financingAmountRange')}</dt>
                    <dd className="font-medium">{application.invoicingDetails.financingAmountRange}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-3">{t('section5Title')}</h2>
            <p className="text-sm text-gray-800">{application.legalBasis || '—'}</p>
            {application.attachments.filter((a) => a.field.startsWith('section5.')).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                {application.attachments
                  .filter((a) => a.field.startsWith('section5.'))
                  .map((a) => (
                    <a
                      key={a.id}
                      href={attachmentHref(a.filename)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                    >
                      {a.filename}
                    </a>
                  ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-3">{t('section6Title')}</h2>
            <div className="space-y-3">
              {groupDatasetsByHolder(
                application.requestedDatasets.map((rd) => ({
                  dataHolderName: rd.dataHolder?.name ?? 'Unknown',
                  name: rd.name,
                  url: rd.url,
                })),
              ).map((group) => (
                <div key={group.dataHolderName}>
                  <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">{group.dataHolderName}</p>
                  <ul className="list-disc list-inside text-sm space-y-0.5">
                    {group.datasets.map((dataset) => (
                      <li key={dataset.name}>
                        {dataset.url ? (
                          <a href={dataset.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            {dataset.name}
                          </a>
                        ) : (
                          dataset.name
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('variables')}</p>
                <p className="text-gray-800">{application.requestedVariables || '—'}</p>
              </div>

              {cohortRows.length > 0 ? (
                <StudyCohortExplorer
                  studyCohorts={application.studyCohorts}
                  includesControls={application.includesControls}
                  includesRelatives={application.includesRelatives}
                  hdeuApplicationId={application.hdeuApplicationId}
                />
              ) : (
                <>
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
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('dataPeriod')}</p>
                    <p className="text-gray-800">
                      {formatDate(application.dataStartDate)} – {formatDate(application.dataEndDate)}
                    </p>
                  </div>
                </>
              )}

              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('processingCountry')}</p>
                <p className="text-gray-800">{application.dataProcessingCountry}</p>
              </div>

              {application.attachments.filter((a) => a.field.includes('section6')).length > 0 && (
                <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                  {application.attachments
                    .filter((a) => a.field.includes('section6'))
                    .map((a) => (
                      <a
                        key={a.id}
                        href={attachmentHref(a.filename)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                      >
                        {a.filename}
                      </a>
                    ))}
                </div>
              )}
            </div>
          </section>

          {application.otherDataToCombine && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900 mb-3">{t('section7Title')}</h2>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{application.otherDataDescription || '—'}</p>
            </section>
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-3">{t('section8Title')}</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-gray-500">{t('projectPeriod')}</dt>
                <dd className="font-medium">
                  {formatDate(application.projectStartDate)} – {formatDate(application.projectEndDate)}
                </dd>
              </div>
              {application.dataController && (
                <div>
                  <dt className="text-gray-500">{t('dataController')}</dt>
                  <dd className="font-medium">{application.dataController}</dd>
                </div>
              )}
              {application.transfersOutsideEuEea && (
                <div>
                  <dt className="text-gray-500">{t('transfersOutsideEuEea')}</dt>
                  <dd className="font-medium">{application.transferCountries.join(', ') || t('yes')}</dd>
                </div>
              )}
              {application.lawfulnessOfProcessing.length > 0 && (
                <div>
                  <dt className="text-gray-500">{t('lawfulnessOfProcessing')}</dt>
                  <dd className="font-medium">{application.lawfulnessOfProcessing.join(', ')}</dd>
                </div>
              )}
              {application.dataProcessingPersonnel.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-gray-500">{t('dataProcessingPersonnel')}</dt>
                  <dd className="font-medium">{application.dataProcessingPersonnel.join(', ')}</dd>
                </div>
              )}
            </dl>
          </section>

          {(application.consentAwareProcessingFee !== null ||
            application.consentAwareChargeFee !== null ||
            application.consentAwareInformationCorrect !== null ||
            application.consentNoAccessToUnderlyingData !== null) && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900 mb-3">{t('section10Title')}</h2>
              <ul className="text-sm text-gray-800 space-y-1 list-disc list-inside">
                {application.consentAwareProcessingFee && <li>{t('consentAwareProcessingFee')}</li>}
                {application.consentAwareChargeFee && <li>{t('consentAwareChargeFee')}</li>}
                {application.consentAwareInformationCorrect && <li>{t('consentAwareInformationCorrect')}</li>}
                {application.consentNoAccessToUnderlyingData && <li>{t('consentNoAccessToUnderlyingData')}</li>}
              </ul>
            </section>
          )}

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
          <DecisionCardPanel application={application} currentUser={currentUser} />
          <PermitPanel application={{ ...application, dataPermit: currentPermit }} currentUser={currentUser} />
          {application.decisionOutcome === 'POSITIVE' && (
            <ExtractionRequestsPanel
              applicationId={application.id}
              currentUserId={currentUser.id}
              requests={application.extractionRequests}
              dataHolders={dataHolders}
              canManage={['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'].includes(currentUser.role)}
            />
          )}
          {(application.decisionOutcome || application.appeals.length > 0) && (
            <AppealsPanel
              applicationId={application.id}
              appeals={application.appeals}
              canManage={['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'].includes(currentUser.role)}
              currentUserId={currentUser.id}
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
