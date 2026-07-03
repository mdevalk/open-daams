import { prisma } from '@/lib/db';
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/workflow';
import { ApplicationCard } from '@/components/ApplicationCard';
import { ApplicationStatus } from '@prisma/client';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
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

  return (
    <div className="space-y-8">
      {/* Page heading */}
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          TEHDAS2 nationale DAAMS-workflow — {new Intl.DateTimeFormat('nl-NL', { dateStyle: 'long' }).format(new Date())}
        </p>
      </div>

      {/* Overdue alert */}
      {overdueApps.length > 0 && (
        <div className="rounded border-l-4 border-[#d52b1e] bg-[#fce8e6] p-4" role="alert">
          <div className="flex items-center gap-2 mb-3">
            <span aria-hidden="true">🔴</span>
            <h2 className="font-semibold text-[#7a1711]">
              {overdueApps.length} aanvra{overdueApps.length !== 1 ? 'gen' : 'ag'} met verlopen beslisdeadline
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {overdueApps.map((app) => (
              <ApplicationCard key={app.id} application={app} />
            ))}
          </div>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Totaal aanvragen', value: total },
          { label: 'Actief / in behandeling', value: activeCount },
          { label: 'Verlopen deadlines', value: overdueApps.length, alert: overdueApps.length > 0 },
          { label: 'Statustypen actief', value: byStatus.length },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className={cn(
              'rounded border p-5',
              kpi.alert
                ? 'border-[#d52b1e] bg-[#fce8e6]'
                : 'border-gray-200 bg-white',
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

      {/* Status breakdown */}
      <div className="rounded border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Aanvragen per status</h2>
        <div className="flex flex-wrap gap-2">
          {byStatus.map((row) => (
            <a
              key={row.status}
              href={`/applications?status=${row.status}`}
              className="inline-flex items-center gap-2 rounded border px-3 py-1 text-sm font-medium hover:opacity-80 transition-opacity bg-white border-[#01689b] text-[#154273]"
            >
              {STATUS_LABELS[row.status]}
              <span className="rounded-full bg-[#154273] text-white text-xs px-1.5 py-0.5 font-bold">
                {row._count.id}
              </span>
            </a>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Recentelijk bijgewerkt</h2>
          <a href="/applications" className="text-sm text-[#01689b] hover:underline">Alle aanvragen →</a>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {applications.map((app) => (
            <ApplicationCard key={app.id} application={app} />
          ))}
        </div>
      </div>
    </div>
  );
}
