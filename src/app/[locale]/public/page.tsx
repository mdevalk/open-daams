import { prisma } from '@/lib/db';
import { getTranslations } from 'next-intl/server';
import { formatDate, purposeLabel } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Public transparency register (Art. 57(1)(j)(ii), 58, 61(4), D6.3 §5.1/§7.11).
 * Deliberately shows only public-safe fields: no applicant name/email, only
 * organisation, and no internal case-handling details.
 */
export default async function PublicRegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'public' });

  const [publishedApplications, publishedDecisions] = await Promise.all([
    prisma.application.findMany({
      where: { publishedAt: { not: null } },
      select: {
        id: true,
        referenceNumber: true,
        title: true,
        purposeCategory: true,
        publishedAt: true,
        applicant: { select: { organisation: true } },
      },
      orderBy: { publishedAt: 'desc' },
    }),
    prisma.application.findMany({
      where: { decisionPublishedAt: { not: null } },
      select: {
        id: true,
        referenceNumber: true,
        title: true,
        decisionOutcome: true,
        decisionSummary: true,
        decisionPublishedAt: true,
        applicant: { select: { organisation: true } },
      },
      orderBy: { decisionPublishedAt: 'desc' },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-3xl">{t('subtitle')}</p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-900 mb-4">{t('applicationsTitle')}</h2>
        {publishedApplications.length === 0 ? (
          <p className="text-sm text-gray-500">{t('noApplications')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4 font-medium">{t('colReference')}</th>
                  <th className="py-2 pr-4 font-medium">{t('colTitle')}</th>
                  <th className="py-2 pr-4 font-medium">{t('colOrganisation')}</th>
                  <th className="py-2 pr-4 font-medium">{t('colPurpose')}</th>
                  <th className="py-2 pr-4 font-medium">{t('colPublished')}</th>
                </tr>
              </thead>
              <tbody>
                {publishedApplications.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-mono text-xs">{a.referenceNumber}</td>
                    <td className="py-2 pr-4">{a.title}</td>
                    <td className="py-2 pr-4">{a.applicant.organisation}</td>
                    <td className="py-2 pr-4">{purposeLabel(a.purposeCategory)}</td>
                    <td className="py-2 pr-4">{formatDate(a.publishedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-900 mb-4">{t('decisionsTitle')}</h2>
        {publishedDecisions.length === 0 ? (
          <p className="text-sm text-gray-500">{t('noDecisions')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4 font-medium">{t('colReference')}</th>
                  <th className="py-2 pr-4 font-medium">{t('colTitle')}</th>
                  <th className="py-2 pr-4 font-medium">{t('colOrganisation')}</th>
                  <th className="py-2 pr-4 font-medium">{t('colDecision')}</th>
                  <th className="py-2 pr-4 font-medium">{t('colSummary')}</th>
                  <th className="py-2 pr-4 font-medium">{t('colPublished')}</th>
                </tr>
              </thead>
              <tbody>
                {publishedDecisions.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-mono text-xs">{a.referenceNumber}</td>
                    <td className="py-2 pr-4">{a.title}</td>
                    <td className="py-2 pr-4">{a.applicant.organisation}</td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                        a.decisionOutcome === 'POSITIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {a.decisionOutcome === 'POSITIVE' ? t('positive') : t('negative')}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-600 max-w-xs">{a.decisionSummary || '—'}</td>
                    <td className="py-2 pr-4">{formatDate(a.decisionPublishedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
