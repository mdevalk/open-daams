import { ComponentProps } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { PermitCard } from '@/components/PermitCard';
import { PermitPanel } from '@/components/PermitPanel';
import { AuthorizedPersonsPanel } from '@/components/AuthorizedPersonsPanel';
import { InvoicePanel } from '@/components/InvoicePanel';
import { SpeProvisioningPanel } from '@/components/SpeProvisioningPanel';
import { PermitChangeRequestPanel } from '@/components/PermitChangeRequestPanel';
import { PERMIT_STATUS_LABELS } from '@/lib/permit';
import { formatDate, formatDateTime, serializePrisma } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function PermitDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const t = await getTranslations({ locale, namespace: 'permits' });

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
            applicant: { select: { name: true, organisation: true, email: true } },
          },
        },
        logs: {
          include: { user: { select: { name: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
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

  // DataPermit carries Prisma Decimal fee fields, which the RSC boundary
  // can't serialise when passed to the client panels below.
  const permit = serializePrisma(rawPermit);

  const currentUser =
    users.find(u => u.role === 'DECISION_MAKER') ??
    users.find(u => u.role === 'ADMIN') ??
    users[0];

  if (!currentUser) notFound();

  const fakeApplication = {
    ...permit.application,
    dataPermit: permit,
  };

  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-500">
        <a href={`/${locale}/permits`} className="hover:text-gray-900">{t('breadcrumb')}</a>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-mono">{permit.permitNumber}</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 font-mono">{permit.permitNumber}</h1>
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
            <PermitCard permit={permit} />
          </section>

          {permit.application?.applicant && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900 mb-4">{t('applicantTitle')}</h2>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-gray-500">{t('name')}</dt><dd className="font-medium">{permit.application.applicant.name}</dd></div>
                <div><dt className="text-gray-500">{t('organisation')}</dt><dd className="font-medium">{permit.application.applicant.organisation}</dd></div>
                <div><dt className="text-gray-500">{t('email')}</dt><dd className="font-medium">{permit.application.applicant.email}</dd></div>
                <div>
                  <dt className="text-gray-500">{t('applicationType')}</dt>
                  <dd className="font-medium">{permit.application.type === 'DATA_ACCESS_APPLICATION' ? 'Data-toegangsaanvraag (Art. 67)' : 'Dataverzoek (Art. 69)'}</dd>
                </div>
              </dl>
            </section>
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-4">{t('historyTitle')}</h2>
            {permit.logs.length === 0 ? (
              <p className="text-sm text-gray-500">{t('noHistory')}</p>
            ) : (
              <ol className="space-y-3">
                {permit.logs.map((log, i) => (
                  <li key={log.id} className="flex gap-3 text-sm">
                    <div className="flex flex-col items-center">
                      <span className="w-6 h-6 rounded-full bg-[#154273] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">{i + 1}</span>
                      {i < permit.logs.length - 1 && <div className="w-px flex-1 bg-gray-200 my-1" />}
                    </div>
                    <div className="pb-3">
                      <p className="font-medium text-gray-900">{log.action}</p>
                      {log.fromStatus && <p className="text-xs text-gray-500">{PERMIT_STATUS_LABELS[log.fromStatus]} → {PERMIT_STATUS_LABELS[log.toStatus]}</p>}
                      {log.comment && <p className="text-xs text-gray-600 mt-1 italic">{log.comment}</p>}
                      <p className="text-xs text-gray-400 mt-1">{log.user.name} · {log.user.role} · {formatDateTime(log.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <PermitPanel application={fakeApplication} currentUser={currentUser} />
          <PermitChangeRequestPanel
            permitId={permit.id}
            permitStatus={permit.status}
            requests={permit.changeRequests as unknown as ComponentProps<typeof PermitChangeRequestPanel>['requests']}
            canRequest={['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'].includes(currentUser.role)}
            canDecide={['DECISION_MAKER', 'ADMIN'].includes(currentUser.role)}
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
        </div>
      </div>
    </div>
  );
}
