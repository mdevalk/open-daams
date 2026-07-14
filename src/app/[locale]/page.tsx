import { prisma } from '@/lib/db';
import { ApplicationCard } from '@/components/ApplicationCard';
import { ApplicationStatus } from '@prisma/client';
import { cn } from '@/lib/utils';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'dashboard' });
  const tStatus = await getTranslations({ locale, namespace: 'status' });

  const [applications, overdueApps, byStatus] = await Promise.all([
    prisma.application.findMany({
      include: {
        applicant: { select: { name: true, organisation: true } },
        caseHandler: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    }),
    prisma.application.findMany({
      where: {
        decisionDeadline: { lt: new Date() },
        status: { notIn: ['DECISION_ISSUED', 'WITHDRAWN'] },
      },
      include: {
        applicant: { select: { name: true, organisation: true } },
        caseHandler: { select: { name: true } },
      },
    }),
    prisma.application.groupBy({ by: ['status'], _count: { id: true } }),
  ]);

  const activeStatuses: ApplicationStatus[] = [
    'SUBMITTED', 'PRE_SCREENING', 'AWAITING_ADDITIONAL_INFORMATION', 'PROCESSING',
  ];
  const activeCount = byStatus
    .filter((r) => activeStatuses.includes(r.status))
    .reduce((sum, r) => sum + r._count.id, 0);
  const total = byStatus.reduce((sum, r) => sum + r._count.id, 0);
  const completedCount = byStatus
    .filter((r) => r.status === 'DECISION_ISSUED')
    .reduce((sum, r) => sum + r._count.id, 0);

  return (
    <div className="space-y-8">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
      </div>

      {overdueApps.length > 0 && (
        <div className="rounded border-l-4 border-[#d52b1e] bg-[#fce8e6] p-4" role="alert">
          <div className="flex items-center gap-2 mb-3">
            <span aria-hidden="true">🔴</span>
            <h2 className="font-semibold text-[#7a1711]">
              {t('overdueAlert', { count: overdueApps.length })}
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {overdueApps.map((app) => (
              <ApplicationCard key={app.id} application={app} locale={locale} />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t('kpiTotal'),       value: total },
          { label: t('kpiActive'),      value: activeCount },
          { label: t('kpiOverdue'),     value: overdueApps.length, alert: overdueApps.length > 0 },
          { label: t('kpiCompleted'),    value: completedCount },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className={cn(
              'rounded border p-5',
              kpi.alert ? 'border-[#d52b1e] bg-[#fce8e6]' : 'border-gray-200 bg-white',
            )}
          >
            <p className="text-3xl font-bold" style={{ color: kpi.alert ? '#7a1711' : '#154273' }}>
              {kpi.value}
            </p>
            <p className={`text-xs mt-1 ${kpi.alert ? 'text-[#d52b1e] font-medium' : 'text-gray-500'}`}>
              {kpi.label}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-900 mb-3">{t('byStatus')}</h2>
        <div className="flex flex-wrap gap-2">
          {byStatus.map((row) => (
            <a
              key={row.status}
              href={`/${locale}/applications?status=${row.status}`}
              className="inline-flex items-center gap-2 rounded border px-3 py-1 text-sm font-medium hover:opacity-80 transition-opacity bg-white border-[#01689b] text-[#154273]"
            >
              {tStatus(row.status)}
              <span className="rounded-full bg-[#154273] text-white text-xs px-1.5 py-0.5 font-bold">
                {row._count.id}
              </span>
            </a>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">{t('recentActivity')}</h2>
          <a href={`/${locale}/applications`} className="text-sm text-[#01689b] hover:underline">
            {t('allApplications')}
          </a>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {applications.map((app) => (
            <ApplicationCard key={app.id} application={app} locale={locale} />
          ))}
        </div>
      </div>
    </div>
  );
}
