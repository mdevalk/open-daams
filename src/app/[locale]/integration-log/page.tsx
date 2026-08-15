import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { NcpCallDirection, NcpCallOutcome } from '@prisma/client';
import { IntegrationLogTable } from '@/components/IntegrationLogTable';

export const dynamic = 'force-dynamic';

export default async function IntegrationLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ direction?: string; outcome?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: 'integrationLog' });

  const direction = sp.direction as NcpCallDirection | undefined;
  const outcome = sp.outcome as NcpCallOutcome | undefined;

  const entries = await prisma.ncpIntegrationLog.findMany({
    where: {
      ...(direction ? { direction } : {}),
      ...(outcome ? { outcome } : {}),
    },
    include: {
      application: { select: { id: true, referenceNumber: true } },
      initiatedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('description')}</p>
      </div>

      <form method="GET" className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('colDirection')}</label>
          <select
            name="direction"
            defaultValue={direction ?? ''}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]"
          >
            <option value="">{t('allDirections')}</option>
            <option value="OUTBOUND">{t('directionOutbound')}</option>
            <option value="INBOUND">{t('directionInbound')}</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('colOutcome')}</label>
          <select
            name="outcome"
            defaultValue={outcome ?? ''}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]"
          >
            <option value="">{t('allOutcomes')}</option>
            <option value="SUCCESS">{t('outcomeSuccess')}</option>
            <option value="FAILURE">{t('outcomeFailure')}</option>
          </select>
        </div>
        <button type="submit" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100">
          {t('filter')}
        </button>
        {(direction || outcome) && (
          <a href={`/${locale}/integration-log`} className="text-sm text-[#01689b] hover:underline self-end pb-0.5">
            {t('clearFilter')}
          </a>
        )}
      </form>

      <IntegrationLogTable entries={entries} locale={locale} />
    </div>
  );
}
