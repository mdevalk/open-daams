import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { PermitCard } from '@/components/PermitCard';
import { PermitPanel } from '@/components/PermitPanel';
import { PERMIT_STATUS_LABELS } from '@/lib/permit';
import { formatDate, formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function PermitDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const t = await getTranslations({ locale, namespace: 'permits' });

  const [permit, users] = await Promise.all([
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
      },
    }),
    prisma.user.findMany({ orderBy: { name: 'asc' } }),
  ]);

  if (!permit) notFound();

  const currentUser =
    users.find(u => u.role === 'DECISION_MAKER') ??
    users.find(u => u.role === 'ADMIN') ??
    users[0];

  if (!currentUser) notFound();

  const fakeApplication = {
    ...permit.application,
    dataPermit: permit,
  } as Parameters<typeof PermitPanel>[0]['application'];

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
            href={`/${locale}/permits/${permit.id}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded border border-[#154273] px-3 py-1.5 text-sm font-medium text-[#154273] hover:bg-[#e8f4fb] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M5 4v3H4a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v2a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2h1a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1Zm2 0h6v3H7V4Zm-1 9v-1h8v1H6Zm-1-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" clipRule="evenodd" />
            </svg>
            PDF / Afdrukken
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
                  <dd className="font-medium">{permit.application.type === 'DATA_ACCESS_APPLICATION' ? 'Data-toegangsaanvraag (Art. 46)' : 'Dataverzoek (Art. 69)'}</dd>
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

        <div>
          <PermitPanel application={fakeApplication} currentUser={currentUser} />
        </div>
      </div>
    </div>
  );
}
