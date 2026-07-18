import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { PERMIT_STATUS_COLORS, formatPermitId } from '@/lib/permit';
import { DataPermitStatus } from '@prisma/client';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function PermitsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'permits' });
  const tps = await getTranslations({ locale, namespace: 'permitStatus' });

  const permits = await prisma.dataPermit.findMany({
    // Only the current version of each application's permit chain (D6.4 §9.3);
    // superseded versions stay in the DB for audit but not in the list.
    where: { isCurrent: true, ...(status ? { status: status as DataPermitStatus } : {}) },
    include: {
      application: {
        select: {
          referenceNumber: true,
          title: true,
          type: true,
          applicant: { select: { name: true, organisation: true } },
        },
      },
    },
    orderBy: { issuedAt: 'desc' },
  });

  const counts = await prisma.dataPermit.groupBy({
    by: ['status'],
    where: { isCurrent: true },
    _count: true,
  });

  const countMap: Record<string, number> = {};
  counts.forEach(c => { countMap[c.status] = c._count; });
  const total = Object.values(countMap).reduce((a, b) => a + b, 0);

  const statuses: DataPermitStatus[] = ['GRANTED', 'AMENDED', 'RENEWED', 'REVOKED', 'EXPIRED'];

  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-500">
        <span className="text-gray-900">{t('breadcrumb')}</span>
      </div>

      <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <a
          href={`/${locale}/permits`}
          className={`rounded-lg border p-4 text-center transition-colors ${
            !status ? 'border-[#154273] bg-[#e8f4fb]' : 'border-gray-200 bg-white hover:bg-gray-50'
          }`}
        >
          <p className="text-2xl font-bold text-[#154273]">{total}</p>
          <p className="text-xs text-gray-600 mt-1">{t('total')}</p>
        </a>
        {statuses.map(s => (
          <a
            key={s}
            href={`/${locale}/permits?status=${s}`}
            className={`rounded-lg border p-4 text-center transition-colors ${
              status === s ? 'border-[#154273] bg-[#e8f4fb]' : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}
          >
            <p className="text-2xl font-bold text-gray-900">{countMap[s] ?? 0}</p>
            <p className="text-xs text-gray-600 mt-1">{tps(s)}</p>
          </a>
        ))}
      </div>

      {/* List */}
      {permits.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="font-medium text-gray-700">{t('noResults')}</p>
          <p className="text-sm text-gray-500 mt-1">{t('noResultsSub')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {permits.map(permit => (
            <a
              key={permit.id}
              href={`/${locale}/permits/${permit.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-[#01689b] transition-colors"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <span className="font-mono text-sm font-bold text-gray-900">{formatPermitId(permit.permitNumber, permit.version)}</span>
                  {permit.application && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {permit.application.referenceNumber} — {permit.application.title}
                    </p>
                  )}
                </div>
                <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${
                  PERMIT_STATUS_COLORS[permit.status]
                }`}>
                  {tps(permit.status)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500">{t('applicant')}</p>
                  <p className="font-medium">{permit.application?.applicant.name ?? '—'}</p>
                  <p className="text-xs text-gray-400">{permit.application?.applicant.organisation}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('validFrom')}</p>
                  <p className="font-medium">{formatDate(permit.validFrom)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('validUntil')}</p>
                  <p className="font-medium">{formatDate(permit.validUntil)}</p>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
