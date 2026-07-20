import { ComponentProps } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { PermitCard } from '@/components/PermitCard';
import { AuthorizedPersonsPanel } from '@/components/AuthorizedPersonsPanel';
import { InvoicePanel } from '@/components/InvoicePanel';
import { SpeProvisioningPanel } from '@/components/SpeProvisioningPanel';
import { PermitChangeRequestPanel } from '@/components/PermitChangeRequestPanel';
import { PERMIT_STATUS_COLORS, formatPermitId } from '@/lib/permit';
import { formatDate, formatDateTime, purposeLabel, serializePrisma } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// A dl row that renders nothing when the value is empty (mirrors the PDF, which
// only prints fields that carry data).
function Field({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium whitespace-pre-wrap break-words">{value}</dd>
    </div>
  );
}

// Retention deadline: data deleted ≤ 6 months after the permit expires (Art. 68(12)).
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export default async function PermitDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const t = await getTranslations({ locale, namespace: 'permits' });
  const te = await getTranslations({ locale, namespace: 'ethicalReview' });
  const tps = await getTranslations({ locale, namespace: 'permitStatus' });

  const [rawPermit, users] = await Promise.all([
    prisma.dataPermit.findUnique({
      where: { id },
      include: {
        application: {
          select: {
            id: true,
            referenceNumber: true,
            title: true,
            type: true,
            status: true,
            decisionOutcome: true,
            decisionSummary: true,
            projectDescription: true,
            purposeCategory: true,
            legalBasis: true,
            requestedDatasets: true,
            requestedVariables: true,
            studyPopulation: true,
            inclusionCriteria: true,
            exclusionCriteria: true,
            dataStartDate: true,
            dataEndDate: true,
            dataProcessingCountry: true,
            isCrossBorder: true,
            usesOptOutException: true,
            optOutExceptionJustification: true,
            speName: true,
            speTechnicalRequirements: true,
            ethicalReviewRequired: true,
            ethicalReviewStatus: true,
            ethicalReviewBody: true,
            ethicalReviewReference: true,
            ethicalReviewDate: true,
            applicant: { select: { name: true, organisation: true, email: true } },
          },
        },
        previousPermit: { select: { id: true, permitNumber: true, version: true } },
        authorizedPersons: { orderBy: { addedAt: 'asc' } },
        changeRequests: {
          include: {
            requestedBy: { select: { name: true } },
            decidedBy: { select: { name: true } },
          },
          orderBy: { requestedAt: 'desc' },
        },
        invoices: {
          include: { createdBy: { select: { name: true, role: true } } },
          orderBy: { createdAt: 'desc' },
        },
        speProvisioning: {
          include: {
            logs: {
              include: { user: { select: { name: true, role: true } } },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    }),
    prisma.user.findMany({ orderBy: { name: 'asc' } }),
  ]);

  if (!rawPermit) notFound();

  // The full version chain for this application (D6.4 §9.3) and the logs
  // aggregated across every version, so a version's page shows the complete
  // permit history (issue → amend → renew …), not just its own events.
  const [versions, chainLogs] = await Promise.all([
    prisma.dataPermit.findMany({
      where: { applicationId: rawPermit.applicationId },
      select: { id: true, permitNumber: true, version: true, status: true, isCurrent: true },
      orderBy: { version: 'asc' },
    }),
    prisma.dataPermitLog.findMany({
      where: { permit: { applicationId: rawPermit.applicationId } },
      include: { user: { select: { name: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const currentVersion = versions.find((v) => v.isCurrent) ?? null;

  // DataPermit carries Prisma Decimal fee fields, which the RSC boundary
  // can't serialise when passed to the client panels below.
  const permit = serializePrisma(rawPermit);

  const currentUser =
    users.find(u => u.role === 'DECISION_MAKER') ??
    users.find(u => u.role === 'ADMIN') ??
    users[0];

  if (!currentUser) notFound();

  const app = permit.application;
  const isDataRequest = app?.type === 'DATA_REQUEST';
  const retentionDeadline = permit.validUntil ? addMonths(new Date(permit.validUntil), 6) : null;
  const showEthical =
    app?.ethicalReviewRequired && app.ethicalReviewStatus && app.ethicalReviewStatus !== 'NOT_REQUIRED';

  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-500">
        <a href={`/${locale}/permits`} className="hover:text-gray-900">{t('breadcrumb')}</a>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-mono">{formatPermitId(permit.permitNumber, permit.version)}</span>
      </div>

      {!permit.isCurrent && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t('supersededNotice', { version: permit.version })}{' '}
          {currentVersion && (
            <a href={`/${locale}/permits/${currentVersion.id}`} className="font-medium underline">
              {t('goToCurrent', { version: currentVersion.version })}
            </a>
          )}
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 font-mono">{formatPermitId(permit.permitNumber, permit.version)}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {permit.application?.referenceNumber} — {permit.application?.title}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/permits/${permit.id}/pdf`}
            download
            className="inline-flex items-center gap-1.5 rounded border border-[#154273] px-3 py-1.5 text-sm font-medium text-[#154273] hover:bg-[#e8f4fb] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
              <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
            </svg>
            PDF downloaden
          </a>
          <a
            href={`/${locale}/applications/${permit.application?.id}`}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors"
          >
            {t('viewApplication')}
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-4">{t('detailsTitle')}</h2>
            <PermitCard permit={permit} locale={locale} />
          </section>

          {app?.applicant && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900 mb-4">{t('applicantTitle')} (§2)</h2>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <Field label={t('name')} value={app.applicant.name} />
                <Field label={t('organisation')} value={app.applicant.organisation} />
                <Field label={t('email')} value={app.applicant.email} />
                <Field
                  label={t('applicationType')}
                  value={isDataRequest ? 'Dataverzoek (Art. 69)' : 'Data-toegangsaanvraag (Art. 67)'}
                />
              </dl>
            </section>
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-4">{t('subjectTitle')} (§4)</h2>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Field label={t('projectTitle')} value={app?.title} wide />
              <Field label={t('projectDescription')} value={app?.projectDescription} wide />
            </dl>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-4">{t('scopeTitle')} (§6.2–6.4)</h2>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Field label={t('purpose')} value={app?.purposeCategory ? purposeLabel(app.purposeCategory) : null} wide />
              <Field label={t('legalBasis')} value={app?.legalBasis} wide />
              <Field label={t('datasets')} value={app?.requestedDatasets?.length ? app.requestedDatasets.join(', ') : null} wide />
              <Field label={t('variables')} value={app?.requestedVariables} wide />
              <Field label={t('studyPopulation')} value={app?.studyPopulation} wide />
              <Field label={t('inclusionCriteria')} value={app?.inclusionCriteria} />
              <Field label={t('exclusionCriteria')} value={app?.exclusionCriteria} />
              <Field label={t('processingCountry')} value={app?.dataProcessingCountry} />
              {showEthical && (
                <>
                  <Field label={t('ethicalReview')} value={te(`status${app?.ethicalReviewStatus}`)} />
                  <Field label={te('committee')} value={app?.ethicalReviewBody} />
                  <Field label={te('reference')} value={app?.ethicalReviewReference} />
                  <Field label={te('date')} value={app?.ethicalReviewDate ? formatDate(app.ethicalReviewDate) : null} />
                </>
              )}
            </dl>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-4">{t('decisionTitle')} (§5, §6.6)</h2>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Field label={t('decisionSummary')} value={app?.decisionSummary} wide />
              <Field label={t('accessPeriod')} value={`${formatDate(permit.validFrom)} — ${formatDate(permit.validUntil)}`} />
              <Field label={t('retention')} value={retentionDeadline ? t('retentionValue', { date: formatDate(retentionDeadline) }) : null} />
              <Field
                label={t('sourceDataPeriod')}
                value={app?.dataStartDate || app?.dataEndDate ? `${formatDate(app?.dataStartDate ?? null)} — ${formatDate(app?.dataEndDate ?? null)}` : null}
              />
              <Field label={t('crossBorder')} value={app?.isCrossBorder ? t('crossBorderYes', { country: app.dataProcessingCountry ?? '—' }) : null} />
              {!isDataRequest && <Field label={t('speName')} value={app?.speName} />}
              {!isDataRequest && <Field label={t('speTechnical')} value={app?.speTechnicalRequirements} wide />}
              <Field label={t('optOut')} value={app?.usesOptOutException ? t('optOutApplicable') : null} />
              <Field label={t('optOutJustification')} value={app?.usesOptOutException ? app.optOutExceptionJustification : null} wide />
            </dl>
            <p className="text-xs text-gray-400 italic mt-3">{t('iprNote')}</p>
          </section>
        </div>

        <div className="space-y-4">
          {versions.length > 1 && (
            <div className="rounded border border-gray-200 bg-white p-4 space-y-2">
              <h3 className="text-sm font-semibold text-gray-900">{t('versionsTitle')} (D6.4 §9.3)</h3>
              <ol className="space-y-1.5">
                {versions.map((v) => {
                  const isViewed = v.id === permit.id;
                  const inner = (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold">{formatPermitId(v.permitNumber, v.version)}</span>
                        {v.isCurrent && <span className="text-[10px] font-medium text-emerald-700">{t('current')}</span>}
                      </div>
                      <span className={`mt-0.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${PERMIT_STATUS_COLORS[v.status]}`}>
                        {tps(v.status)}
                      </span>
                    </>
                  );
                  return (
                    <li key={v.id}>
                      {isViewed ? (
                        <div className="rounded border border-[#154273] bg-[#eef4fb] px-2 py-1.5">
                          {inner}
                          <p className="text-[10px] text-gray-500 mt-0.5">{t('viewingThisVersion')}</p>
                        </div>
                      ) : (
                        <a
                          href={`/${locale}/permits/${v.id}`}
                          className="block rounded border border-gray-200 hover:border-[#01689b] px-2 py-1.5 transition-colors"
                        >
                          {inner}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          <PermitChangeRequestPanel
            permitId={permit.id}
            permitStatus={permit.status}
            requests={permit.changeRequests as unknown as ComponentProps<typeof PermitChangeRequestPanel>['requests']}
            canRequest={permit.isCurrent && ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'].includes(currentUser.role)}
            canDecide={permit.isCurrent && ['DECISION_MAKER', 'ADMIN'].includes(currentUser.role)}
            currentUserId={currentUser.id}
          />
          <AuthorizedPersonsPanel
            permitId={permit.id}
            persons={permit.authorizedPersons}
            canManage={['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'].includes(currentUser.role)}
            currentUserId={currentUser.id}
          />
          <InvoicePanel
            permitId={permit.id}
            invoices={permit.invoices as unknown as ComponentProps<typeof InvoicePanel>['invoices']}
            canIssue={['DECISION_MAKER', 'ADMIN'].includes(currentUser.role)}
            canManage={['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'].includes(currentUser.role)}
            currentUserId={currentUser.id}
            hasFeesRecorded={[
              permit.permitProcessingFee,
              permit.dataPreparationFee,
              permit.speSetupFee,
              permit.speUsageFee,
              permit.additionalServicesFee,
              permit.dataHolderFee,
            ].some((v) => v != null)}
          />
          {permit.application?.type === 'DATA_ACCESS_APPLICATION' && (
            <SpeProvisioningPanel
              permitId={permit.id}
              order={permit.speProvisioning as unknown as ComponentProps<typeof SpeProvisioningPanel>['order']}
              canManage={['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'].includes(currentUser.role)}
              currentUserId={currentUser.id}
            />
          )}

          {permit.signature && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900 mb-4">{t('digitalPermitTitle')}</h2>
              <dl className="grid grid-cols-1 gap-3 text-sm mb-4">
                <Field label={t('signatureAlgorithm')} value="Ed25519" />
                <Field label={t('signatureKeyId')} value={permit.signingKeyId} />
                <Field label={t('signedAt')} value={permit.signedAt ? formatDateTime(permit.signedAt) : null} />
                <Field
                  label={t('signature')}
                  value={<span className="font-mono text-xs break-all">{permit.signature.slice(0, 32)}...</span>}
                />
              </dl>
              <a
                href={`/api/permits/${permit.id}/json`}
                download
                className="inline-flex items-center gap-1.5 rounded border border-[#154273] px-3 py-1.5 text-sm font-medium text-[#154273] hover:bg-[#e8f4fb] transition-colors"
              >
                {t('downloadDigitalPermit')}
              </a>
            </section>
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-4">{t('historyTitle')}</h2>
            {chainLogs.length === 0 ? (
              <p className="text-sm text-gray-500">{t('noHistory')}</p>
            ) : (
              <ol className="space-y-3">
                {chainLogs.map((log, i) => (
                  <li key={log.id} className="flex gap-3 text-sm">
                    <div className="flex flex-col items-center">
                      <span className="w-6 h-6 rounded-full bg-[#154273] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">{i + 1}</span>
                      {i < chainLogs.length - 1 && <div className="w-px flex-1 bg-gray-200 my-1" />}
                    </div>
                    <div className="pb-3">
                      <p className="font-medium text-gray-900">{log.action}</p>
                      {log.fromStatus && <p className="text-xs text-gray-500">{tps(log.fromStatus)} → {tps(log.toStatus)}</p>}
                      {log.comment && <p className="text-xs text-gray-600 mt-1 italic">{log.comment}</p>}
                      <p className="text-xs text-gray-400 mt-1">{log.user.name} · {log.user.role} · {formatDateTime(log.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
