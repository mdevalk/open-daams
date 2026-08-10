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
import { TrustedDataHolderPanel } from '@/components/TrustedDataHolderPanel';
import { UserSwitcher } from '@/components/UserSwitcher';
import { StudyCohortExplorer } from '@/components/StudyCohortExplorer';
import type { CompletenessItem } from '@/app/api/applications/[id]/completeness-check/route';
import { formatDate, formatDateTime, purposeLabel, serializePrisma } from '@/lib/utils';
import { formatPermitId } from '@/lib/permit';
import { groupDatasetsByHolder } from '@/lib/permit-signing';

export const dynamic = 'force-dynamic';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div>
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

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

  const [rawApplication, users, dataHolders, speOperators] = await Promise.all([
    prisma.application.findUnique({
      where: { id },
      include: {
        applicant: { include: { dataUser: { select: { name: true } } } },
        dataPermits: { where: { isCurrent: true } },
        feeEstimate: { include: { invoice: true } },
        logs: {
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
        trustedDataHolder: { select: { name: true } },
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
        relatedDataPermits: { orderBy: { createdAt: 'asc' } },
        tabulationPlans: { orderBy: { createdAt: 'asc' } },
      },
    }),
    prisma.user.findMany({ orderBy: { name: 'asc' } }),
    prisma.dataHolder.findMany({ orderBy: { name: 'asc' } }),
    prisma.speOperator.findMany({ include: { types: { orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } }),
  ]);

  // Decimal is a class instance, not a plain object — React's server->client
  // prop serialization rejects it outright, so convert before it crosses
  // that boundary (PermitPanel is a client component).
  const speOperatorsForClient = speOperators.map((op) => ({
    ...op,
    types: op.types.map((t) => ({ ...t, setupFee: t.setupFee.toString(), monthlyFee: t.monthlyFee.toString() })),
  }));

  if (!rawApplication) notFound();

  // FeeEstimate/DataPermit carry Prisma Decimal fields, which the RSC
  // boundary can't serialise when passed to the client panels below.
  const application = serializePrisma(rawApplication);
  // One current permit version per application (D6.4 §9.3 version chain).
  const currentPermit = application.dataPermits[0] ?? null;
  const trustedDataHolders = dataHolders.filter((dh) => dh.isTrusted);

  const attachmentHref = (a: { id: string }) => `/api/attachments/${a.id}?userId=${currentUser.id}`;

  const cohortRows = application.studyCohorts.filter((c) => c.role === 'COHORT');

  // Art. 47/48/49 transfer legal grounds — rendered as a bullet list of
  // whichever specific grounds the applicant flagged true, rather than 11
  // always-visible checkboxes.
  const transferArticleFlags = (
    [
      ['art47', application.whyWillDataBeTransferredOutsideEUArticle47],
      ['art47a', application.whyWillDataBeTransferredOutsideEUArticle47a],
      ['art47b', application.whyWillDataBeTransferredOutsideEUArticle47b],
      ['art47c', application.whyWillDataBeTransferredOutsideEUArticle47c],
      ['art48', application.whyWillDataBeTransferredOutsideEUArticle48],
      ['art48a', application.whyWillDataBeTransferredOutsideEUArticle48a],
      ['art48b', application.whyWillDataBeTransferredOutsideEUArticle48b],
      ['art48c', application.whyWillDataBeTransferredOutsideEUArticle48c],
      ['art48d', application.whyWillDataBeTransferredOutsideEUArticle48d],
      ['art48e', application.whyWillDataBeTransferredOutsideEUArticle48e],
      ['art49', application.whyWillDataBeTransferredOutsideEUArticle49],
    ] as const
  ).filter(([, flag]) => flag);

  const currentUser =
    (queryUserId ? users.find(u => u.id === queryUserId) : null) ??
    (application.status === 'PROCESSING'
      ? users.find(u => u.role === 'DECISION_MAKER')
      : null) ??
    users.find(u => u.role === 'CASE_HANDLER') ??
    users.find(u => u.role === 'DECISION_MAKER') ??
    users[0];

  if (!currentUser) notFound();

  // Filter on the application object itself, not just at the NotesList call
  // site — application is passed whole to several other client components
  // below, and every prop given to a client component is serialised into
  // the page, so a separate filtered variable used in just one place would
  // still leak internal notes via any other component receiving `application`.
  const STAFF_ROLES = ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN', 'DATA_HOLDER'];
  if (!STAFF_ROLES.includes(currentUser.role)) {
    application.notes = application.notes.filter((n) => !n.isInternal);
  }

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
              {application.theResearchFocusesOnTheFollowingObjectives.length > 0 && (
                <div>
                  <dt className="text-gray-500 mb-1">{t('researchObjectives')}</dt>
                  <ul className="space-y-1">
                    {application.theResearchFocusesOnTheFollowingObjectives.map((o) => (
                      <li key={o} className="flex items-start gap-2 font-medium">
                        <span className="text-emerald-600 mt-0.5">✓</span>
                        <span>{o}</span>
                      </li>
                    ))}
                  </ul>
                  {application.theResearchFocusesOnTheFollowingObjectivesOther && (
                    <p className="text-gray-800 mt-1">{application.theResearchFocusesOnTheFollowingObjectivesOther}</p>
                  )}
                </div>
              )}
              {application.areaOfResearch && (
                <div>
                  <dt className="text-gray-500">{t('areaOfResearch')}</dt>
                  <dd className="font-medium">
                    {application.areaOfResearch}
                    {application.areaOfResearchOther ? ` — ${application.areaOfResearchOther}` : ''}
                  </dd>
                </div>
              )}
              {application.descriptionOfTheDataYouWillUse && (
                <div>
                  <dt className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('descriptionOfTheDataYouWillUse')}</dt>
                  <dd className="text-gray-800 whitespace-pre-wrap">{application.descriptionOfTheDataYouWillUse}</dd>
                </div>
              )}
              {application.descriptionOfTheProject && (
                <div>
                  <dt className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('descriptionOfTheProject')}</dt>
                  <dd className="text-gray-800 whitespace-pre-wrap">{application.descriptionOfTheProject}</dd>
                </div>
              )}
              {application.summaryOfTheProject ? (
                <div>
                  <dt className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('summaryOfTheProject')}</dt>
                  <dd className="text-gray-800 whitespace-pre-wrap">{application.summaryOfTheProject}</dd>
                </div>
              ) : (
                application.theNatureOfTheProjectDoesNotLetYouProvideASummaryReason && (
                  <div>
                    <dt className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('summaryNotProvidedReason')}</dt>
                    <dd className="text-gray-800 whitespace-pre-wrap">
                      {application.theNatureOfTheProjectDoesNotLetYouProvideASummaryReason}
                    </dd>
                  </div>
                )
              )}
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
              {application.contactPersonOrganisationName && (
                <div>
                  <dt className="text-gray-500">{t('contactPersonOrganisationName')}</dt>
                  <dd className="font-medium">{application.contactPersonOrganisationName}</dd>
                </div>
              )}
              {application.contactPersonOperatorID && (
                <div>
                  <dt className="text-gray-500">{t('contactPersonOperatorID')}</dt>
                  <dd className="font-medium">{application.contactPersonOperatorID}</dd>
                </div>
              )}
              {application.applyingForMandatedTasks !== null && (
                <div>
                  <dt className="text-gray-500">{t('applyingForMandatedTasks')}</dt>
                  <dd className="font-medium">{application.applyingForMandatedTasks ? t('yes') : t('no')}</dd>
                </div>
              )}
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
            <dl className="mt-3 space-y-3 text-sm">
              {application.whatIsTheAimAndTopicOfTheProject && (
                <div>
                  <dt className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('aimAndTopic')}</dt>
                  <dd className="text-gray-800 whitespace-pre-wrap">{application.whatIsTheAimAndTopicOfTheProject}</dd>
                </div>
              )}
              {application.linkToTheSupportingLegalBasis && (
                <div>
                  <dt className="text-gray-500">{t('linkToTheSupportingLegalBasis')}</dt>
                  <dd className="font-medium break-all">{application.linkToTheSupportingLegalBasis}</dd>
                </div>
              )}
              {application.summaryOfPlanForUsingTheDataLanguage && (
                <div>
                  <dt className="text-gray-500">{t('summaryOfPlanForUsingTheDataLanguage')}</dt>
                  <dd className="font-medium">{application.summaryOfPlanForUsingTheDataLanguage}</dd>
                </div>
              )}
              {application.summaryOfResearchPlanLanguage && (
                <div>
                  <dt className="text-gray-500">{t('summaryOfResearchPlanLanguage')}</dt>
                  <dd className="font-medium">{application.summaryOfResearchPlanLanguage}</dd>
                </div>
              )}
              {(application.personResponsibleName || application.personResponsibleSameAsContactPerson) && (
                <div>
                  <dt className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('personResponsible')}</dt>
                  <dd className="font-medium">
                    {application.personResponsibleSameAsContactPerson
                      ? t('sameAsContactPerson')
                      : [application.personResponsibleName, application.personResponsibleJobTitle, application.personResponsibleAffiliation]
                          .filter(Boolean)
                          .join(' · ')}
                  </dd>
                </div>
              )}
              {(application.personResearchName || application.personResearchSameAsContactPerson) && (
                <div>
                  <dt className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('personResearch')}</dt>
                  <dd className="font-medium">
                    {application.personResearchSameAsContactPerson
                      ? t('sameAsContactPerson')
                      : [application.personResearchName, application.personResearchJobTitle, application.personResearchAffiliation]
                          .filter(Boolean)
                          .join(' · ')}
                  </dd>
                </div>
              )}
            </dl>
            {application.attachments.filter((a) => a.field.startsWith('section5.')).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                {application.attachments
                  .filter((a) => a.field.startsWith('section5.'))
                  .map((a) => (
                    <a
                      key={a.id}
                      href={attachmentHref(a)}
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
                  attachments={application.attachments}
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
                        href={attachmentHref(a)}
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

          {application.type === 'DATA_REQUEST' &&
            (application.ethicalReviewInput ||
              application.whatIsTheFrequencyOfUpdates ||
              application.tabulationPlan ||
              application.tabulationPlans.length > 0) && (
              <section className="rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="font-semibold text-gray-900 mb-3">{t('dataRequestDetailsTitle')}</h2>
                <dl className="space-y-3 text-sm">
                  {application.ethicalReviewInput && (
                    <div>
                      <dt className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('ethicalReviewInput')}</dt>
                      <dd className="text-gray-800 whitespace-pre-wrap">{application.ethicalReviewInput}</dd>
                    </div>
                  )}
                  {application.whatIsTheFrequencyOfUpdates && (
                    <div>
                      <dt className="text-gray-500">{t('frequencyOfUpdates')}</dt>
                      <dd className="font-medium">{application.whatIsTheFrequencyOfUpdates}</dd>
                    </div>
                  )}
                  {application.tabulationPlan && (
                    <div>
                      <dt className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('tabulationPlan')}</dt>
                      <dd className="text-gray-800 whitespace-pre-wrap">{application.tabulationPlan}</dd>
                    </div>
                  )}
                  {application.tabulationPlans.map((tp, i) => (
                    <div key={tp.id} className="rounded border border-gray-100 p-3">
                      <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">
                        {t('tabulationPlanEntry', { index: i + 1 })}
                      </p>
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                        <Field label={t('tabulationRegisteredToBeUsed')} value={tp.tabulationRegisteredToBeUsed} />
                        <Field label={t('tabulationPossibleStudyCohort')} value={tp.tabulationPossibleStudyCohort} />
                        <Field
                          label={t('tabulationInformationOfRequiredVariables')}
                          value={tp.tabulationInformationOfRequiredVariables}
                        />
                        <Field label={t('tabulationFormationVariables')} value={tp.tabulationFormationVariables} />
                        <Field label={t('tabulationDesiredDirection')} value={tp.tabulationDesiredDirection} />
                        <Field label={t('tabulationOrderInWhichTable')} value={tp.tabulationOrderInWhichTable} />
                        <Field label={t('tabulationAnyOtherRelevant')} value={tp.tabulationAnyOtherRelevant} />
                      </dl>
                    </div>
                  ))}
                </dl>
              </section>
            )}

          {(application.otherDataToCombine ||
            application.hasPendingPermitApplications ||
            application.relatedDataPermits.length > 0) && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900 mb-3">{t('section7Title')}</h2>
              <dl className="space-y-3 text-sm">
                {application.otherDataToCombine && (
                  <>
                    <div>
                      <dt className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('otherDataDescription')}</dt>
                      <dd className="text-gray-800 whitespace-pre-wrap">{application.otherDataDescription || '—'}</dd>
                    </div>
                    {(application.otherDataCountries.length > 0 ||
                      application.otherDataHolders.length > 0 ||
                      application.otherDataDatabases.length > 0 ||
                      application.otherDataDatasets.length > 0) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                        <Field label={t('otherDataCountries')} value={application.otherDataCountries.join(', ')} />
                        <Field label={t('otherDataHolders')} value={application.otherDataHolders.join(', ')} />
                        <Field label={t('otherDataDatabases')} value={application.otherDataDatabases.join(', ')} />
                        <Field label={t('otherDataDatasets')} value={application.otherDataDatasets.join(', ')} />
                      </div>
                    )}
                    <Field label={t('otherDataCombinationMethod')} value={application.otherDataCombinationMethod} />
                  </>
                )}
                {application.hasPendingPermitApplications && (
                  <div>
                    <dt className="text-gray-500">{t('pendingPermitApplication')}</dt>
                    <dd className="font-medium">
                      {[application.pendingApplicationIssuer, application.pendingApplicationPermitCode]
                        .filter(Boolean)
                        .join(' · ')}
                      {application.pendingApplicationDate ? ` (${formatDate(application.pendingApplicationDate)})` : ''}
                    </dd>
                  </div>
                )}
                {application.relatedDataPermits.length > 0 && (
                  <div>
                    <dt className="text-gray-500 mb-1">{t('relatedDataPermits')}</dt>
                    <ul className="space-y-1">
                      {application.relatedDataPermits.map((p) => (
                        <li key={p.id} className="font-medium">
                          {[p.permitIssuer, p.permitIdentificationInformation].filter(Boolean).join(' — ')}
                          {p.permitStartDateOfIssue && (
                            <span className="text-gray-500 font-normal">
                              {' '}
                              ({formatDate(p.permitStartDateOfIssue)}
                              {p.permitEndDateOfIssue ? ` – ${formatDate(p.permitEndDateOfIssue)}` : ''})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </dl>
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
              <Field label={t('environmentProviderName')} value={application.environmentProviderName} />
              {application.speTechnicalRequirements && (
                <div className="sm:col-span-2">
                  <dt className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('speTechnicalRequirements')}</dt>
                  <dd className="text-gray-800 whitespace-pre-wrap">{application.speTechnicalRequirements}</dd>
                </div>
              )}
              <Field label={t('dataAccessLaterDate')} value={application.dataAccessLaterDate && formatDate(application.dataAccessLaterDate)} />
              <Field label={t('dataAccessPeriodInfo')} value={application.dataAccessPeriodInfo} />
              <Field label={t('dataAccessUpdateFrequency')} value={application.dataAccessUpdateFrequency} />
              {application.transfersOutsideEuEea && (
                <div>
                  <dt className="text-gray-500">{t('transfersOutsideEuEea')}</dt>
                  <dd className="font-medium">{application.transferCountries.join(', ') || t('yes')}</dd>
                </div>
              )}
              {transferArticleFlags.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-gray-500 mb-1">{t('transferLegalGrounds')}</dt>
                  <ul className="list-disc list-inside space-y-0.5">
                    {transferArticleFlags.map(([key]) => (
                      <li key={key} className="font-medium">
                        {t(`transferArticle.${key}`)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Field
                label={t('legalBasisForTransfer')}
                value={[application.legalBasisForTransferringTheDataOutsideEU, ...application.legalBasisForTransferringTheDataOutsideEUOtherOptions]
                  .filter(Boolean)
                  .join(', ')}
              />
              <Field label={t('safeguardsGDCP')} value={application.safeguardsAreProvidedByReferringGDCP.join(', ')} />
              <Field label={t('safeguardsOther')} value={application.safeguardsAreProvidedByOtherExceptionalLegalBases} />
              {application.complyWithDataMinimisationPrincipleNotEUMember && (
                <div className="sm:col-span-2">
                  <dt className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('dataMinimisationNonEU')}</dt>
                  <dd className="text-gray-800 whitespace-pre-wrap">{application.complyWithDataMinimisationPrincipleNotEUMember}</dd>
                </div>
              )}
              {application.lawfulnessOfProcessing.length > 0 && (
                <div>
                  <dt className="text-gray-500">{t('lawfulnessOfProcessing')}</dt>
                  <dd className="font-medium">
                    {[...application.lawfulnessOfProcessing, application.lawfulnessLegalBasisOther].filter(Boolean).join(', ')}
                  </dd>
                </div>
              )}
              <Field label={t('lawfulForProcessingPersonalData')} value={application.lawfulForProcessingPersonalData.join(', ')} />
              <Field label={t('europeanUnionInstitution')} value={application.europeanUnionInstitution.join(', ')} />
              <Field
                label={t('legalBasisForProcessingCombinedData')}
                value={[...application.legalBasisForProcessingCombinedData, application.otherLegalBasisForProcessingCombinedData]
                  .filter(Boolean)
                  .join(', ')}
              />
              <Field
                label={t('legalBasisForProcessingApplicationData')}
                value={[...application.legalBasisForProcessingApplicationData, application.otherLegalBasisForProcessingApplicationData]
                  .filter(Boolean)
                  .join(', ')}
              />
              <Field
                label={t('legalBasisForProcessingCombinedApplicationData')}
                value={[
                  ...application.legalBasisForProcessingCombinedApplicationData,
                  application.otherLegalBasisForProcessingCombinedApplicationData,
                ]
                  .filter(Boolean)
                  .join(', ')}
              />
              {application.dataProcessingPersonnel.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-gray-500">{t('dataProcessingPersonnel')}</dt>
                  <dd className="font-medium">{application.dataProcessingPersonnel.join(', ')}</dd>
                </div>
              )}
            </dl>
          </section>

          {(application.additionalInformation ||
            application.attachments.some((a) => a.field.startsWith('section9.'))) && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900 mb-3">{t('section9Title')}</h2>
              {application.additionalInformation && (
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{application.additionalInformation}</p>
              )}
              {application.attachments.filter((a) => a.field.startsWith('section9.')).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                  {application.attachments
                    .filter((a) => a.field.startsWith('section9.'))
                    .map((a) => (
                      <a
                        key={a.id}
                        href={attachmentHref(a)}
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
          )}

          {(application.consentAwareProcessingFee !== null ||
            application.consentAwareChargeFee !== null ||
            application.consentAwareInformationCorrect !== null ||
            application.consentNoAccessToUnderlyingData !== null ||
            application.consentAcceptHealthDataBody !== null) && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900 mb-3">{t('section10Title')}</h2>
              <ul className="text-sm text-gray-800 space-y-1 list-disc list-inside">
                {application.consentAwareProcessingFee && <li>{t('consentAwareProcessingFee')}</li>}
                {application.consentAwareChargeFee && <li>{t('consentAwareChargeFee')}</li>}
                {application.consentAwareInformationCorrect && <li>{t('consentAwareInformationCorrect')}</li>}
                {application.consentNoAccessToUnderlyingData && <li>{t('consentNoAccessToUnderlyingData')}</li>}
                {application.consentAcceptHealthDataBody && <li>{t('consentAcceptHealthDataBody')}</li>}
              </ul>
            </section>
          )}

          <EthicalReviewPanel application={application} currentUser={currentUser} />

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
          <TrustedDataHolderPanel
            application={application}
            dataHolders={trustedDataHolders}
            currentUser={currentUser}
          />
          <TransitionPanel application={application} currentUser={currentUser} />
          <FeeEstimatePanel application={application} currentUser={currentUser} />
          <DecisionCardPanel application={application} currentUser={currentUser} />
          <PermitPanel
            application={{ ...application, dataPermit: currentPermit }}
            currentUser={currentUser}
            speOperators={speOperatorsForClient}
          />
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
            <WorkflowTimeline logs={application.logs} />
          </section>
        </div>
      </div>
    </div>
  );
}
