import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { PERMIT_STATUS_COLORS, formatPermitId } from '@/lib/permit';
import { DataPermitStatus, Prisma } from '@prisma/client';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const ACTIVE_STATUSES: DataPermitStatus[] = ['GRANTED', 'AMENDED', 'RENEWED'];
const CLOSED_STATUSES: DataPermitStatus[] = ['REVOKED', 'EXPIRED'];

export default async function PermitsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; filter?: string }>;
}) {
  const { locale } = await params;
  const { status, filter } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'permits' });
  const tps = await getTranslations({ locale, namespace: 'permitStatus' });

  const now = new Date();
  const in14Days = new Date(now.getTime() + 14 * 86_400_000);
  // Practically expired but not yet formally transitioned to EXPIRED — the
  // same signal the dashboard's "Needs attention" overdue tier already
  // computes for permits (src/app/[locale]/page.tsx).
  const needsUpdateWhere = { validUntil: { lt: now }, status: { notIn: CLOSED_STATUSES } };
  const expiringSoonWhere = { validUntil: { gte: now, lt: in14Days }, status: { notIn: CLOSED_STATUSES } };

  const where: Prisma.DataPermitWhereInput =
    filter === 'needsUpdate'
      ? { isCurrent: true, ...needsUpdateWhere }
      : filter === 'expiringSoon'
        ? { isCurrent: true, ...expiringSoonWhere }
        : status
          ? { isCurrent: true, status: status as DataPermitStatus }
          : { isCurrent: true };

  const [permits, counts, needsUpdateCount, expiringSoonCount] = await Promise.all([
    prisma.dataPermit.findMany({
      // Only the current version of each application's permit chain (D6.4 §9.3);
      // superseded versions stay in the DB for audit but not in the list.
      where,
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
    }),
    prisma.dataPermit.groupBy({
      by: ['status'],
      where: { isCurrent: true },
      _count: true,
    }),
    prisma.dataPermit.count({ where: { isCurrent: true, ...needsUpdateWhere } }),
    prisma.dataPermit.count({ where: { isCurrent: true, ...expiringSoonWhere } }),
  ]);

  const countMap: Record<string, number> = {};
  counts.forEach(c => { countMap[c.status] = c._count; });
  const total = Object.values(countMap).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
      </div>

      {/* Work-planning quick filters */}
      <div className="grid grid-cols-3 gap-3">
        <a
          href={`/${locale}/permits`}
          className={`rounded-lg border p-4 text-center transition-colors ${
            !status && !filter ? 'border-[#154273] bg-[#e8f4fb]' : 'border-gray-200 bg-white hover:bg-gray-50'
          }`}
        >
          <p className="text-2xl font-bold text-[#154273]">{total}</p>
          <p className="text-xs text-gray-600 mt-1">{t('total')}</p>
        </a>
        <a
          href={`/${locale}/permits?filter=needsUpdate`}
          className={`rounded-lg border p-4 text-center transition-colors ${
            filter === 'needsUpdate' ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white hover:bg-gray-50'
          }`}
        >
          <p className="text-2xl font-bold text-red-700">{needsUpdateCount}</p>
          <p className="text-xs text-gray-600 mt-1">{t('needsStatusUpdate')}</p>
        </a>
        <a
          href={`/${locale}/permits?filter=expiringSoon`}
          className={`rounded-lg border p-4 text-center transition-colors ${
            filter === 'expiringSoon' ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white hover:bg-gray-50'
          }`}
        >
          <p className="text-2xl font-bold text-amber-700">{expiringSoonCount}</p>
          <p className="text-xs text-gray-600 mt-1">{t('expiringSoon')}</p>
        </a>
      </div>

      {/* Status breakdown, grouped by whether it still needs oversight */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">{t('activeGroup')}</p>
          <div className="grid grid-cols-3 gap-3">
            {ACTIVE_STATUSES.map(s => (
              <a
                key={s}
                href={`/${locale}/permits?status=${s}`}
                className={`rounded-lg border p-3 text-center transition-colors ${
                  status === s ? 'border-[#154273] bg-[#e8f4fb]' : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <p className="text-xl font-bold text-gray-900">{countMap[s] ?? 0}</p>
                <p className="text-xs text-gray-600 mt-1">{tps(s)}</p>
              </a>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">{t('closedGroup')}</p>
          <div className="grid grid-cols-2 gap-3">
            {CLOSED_STATUSES.map(s => (
              <a
                key={s}
                href={`/${locale}/permits?status=${s}`}
                className={`rounded-lg border p-3 text-center transition-colors ${
                  status === s ? 'border-[#154273] bg-[#e8f4fb]' : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <p className="text-xl font-bold text-gray-900">{countMap[s] ?? 0}</p>
                <p className="text-xs text-gray-600 mt-1">{tps(s)}</p>
              </a>
            ))}
          </div>
        </div>
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
