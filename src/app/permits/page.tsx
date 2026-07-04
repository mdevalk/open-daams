import { prisma } from '@/lib/db';
import { PERMIT_STATUS_LABELS, PERMIT_STATUS_COLORS } from '@/lib/permit';
import { PermitCard } from '@/components/PermitCard';
import { DataPermitStatus } from '@prisma/client';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function PermitsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  const permits = await prisma.dataPermit.findMany({
    where: status ? { status: status as DataPermitStatus } : undefined,
    include: {
      application: { select: { referenceNumber: true, title: true, type: true, applicant: { select: { name: true, organisation: true } } } },
    },
    orderBy: { issuedAt: 'desc' },
  });

  const counts = await prisma.dataPermit.groupBy({
    by: ['status'],
    _count: true,
  });

  const countMap: Record<string, number> = {};
  counts.forEach(c => { countMap[c.status] = c._count; });
  const total = Object.values(countMap).reduce((a, b) => a + b, 0);

  const statuses: DataPermitStatus[] = ['GRANTED', 'AMENDED', 'RENEWED', 'REVOKED', 'EXPIRED'];

  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-500">
        <span className="text-gray-900">Vergunningen</span>
      </div>

      <h1 className="text-xl font-bold text-gray-900">Vergunningen</h1>

      {/* KPI kaarten */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <a
          href="/permits"
          className={`rounded-lg border p-4 text-center transition-colors ${
            !status ? 'border-[#154273] bg-[#e8f4fb]' : 'border-gray-200 bg-white hover:bg-gray-50'
          }`}
        >
          <p className="text-2xl font-bold text-[#154273]">{total}</p>
          <p className="text-xs text-gray-600 mt-1">Totaal</p>
        </a>
        {statuses.map(s => (
          <a
            key={s}
            href={`/permits?status=${s}`}
            className={`rounded-lg border p-4 text-center transition-colors ${
              status === s ? 'border-[#154273] bg-[#e8f4fb]' : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}
          >
            <p className="text-2xl font-bold text-gray-900">{countMap[s] ?? 0}</p>
            <p className="text-xs text-gray-600 mt-1">{PERMIT_STATUS_LABELS[s]}</p>
          </a>
        ))}
      </div>

      {/* Lijst */}
      {permits.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="font-medium text-gray-700">Geen vergunningen gevonden</p>
          <p className="text-sm text-gray-500 mt-1">
            Vergunningen worden aangemaakt na een positief besluit op een aanvraag.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {permits.map(permit => (
            <a
              key={permit.id}
              href={`/permits/${permit.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-[#01689b] transition-colors"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <span className="font-mono text-sm font-bold text-gray-900">{permit.permitNumber}</span>
                  {permit.application && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {permit.application.referenceNumber} — {permit.application.title}
                    </p>
                  )}
                </div>
                <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${
                  PERMIT_STATUS_COLORS[permit.status]
                }`}>
                  {PERMIT_STATUS_LABELS[permit.status]}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Aanvrager</p>
                  <p className="font-medium">{permit.application?.applicant.name ?? '—'}</p>
                  <p className="text-xs text-gray-400">{permit.application?.applicant.organisation}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Geldig van</p>
                  <p className="font-medium">{formatDate(permit.validFrom)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Geldig tot</p>
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
