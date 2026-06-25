import { prisma } from '@/lib/db';
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/workflow';
import { ApplicationCard } from '@/components/ApplicationCard';
import { formatDate } from '@/lib/utils';
import { ApplicationStatus } from '@prisma/client';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [applications, overdueApps] = await Promise.all([
    prisma.application.findMany({
      include: {
        applicant: { select: { name: true, organisation: true } },
        caseHandler: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
    prisma.application.findMany({
      where: {
        decisionDeadline: { lt: new Date() },
        status: { notIn: ['PERMIT_GRANTED', 'PERMIT_REFUSED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'COMPLETED', 'WITHDRAWN', 'INADMISSIBLE'] },
      },
      include: {
        applicant: { select: { name: true, organisation: true } },
        caseHandler: { select: { name: true } },
      },
    }),
  ]);

  const byStatus = await prisma.application.groupBy({
    by: ['status'],
    _count: { id: true },
  });

  const activeStatuses: ApplicationStatus[] = [
    'SUBMITTED', 'ADMISSIBILITY_CHECK', 'INCOMPLETE', 'UNDER_ASSESSMENT', 'INFO_REQUESTED',
  ];
  const activeCount = byStatus
    .filter((r) => activeStatuses.includes(r.status))
    .reduce((sum, r) => sum + r._count.id, 0);

  const total = byStatus.reduce((sum, r) => sum + r._count.id, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          TEHDAS2 national DAAMS workflow &mdash; {new Intl.DateTimeFormat('nl-NL', { dateStyle: 'long' }).format(new Date())}
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total applications', value: total },
          { label: 'Active / in progress', value: activeCount },
          { label: 'Overdue decisions', value: overdueApps.length, alert: overdueApps.length > 0 },
          { label: 'Types tracked', value: byStatus.length },
        ].map((kpi) => (
          <div key={kpi.label} className={cn('rounded-xl border p-5', kpi.alert ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white')}>
            <p className="text-3xl font-bold text-gray-900">{kpi.value}</p>
            <p className={cn('text-xs mt-1', kpi.alert ? 'text-red-600 font-medium' : 'text-gray-500')}>{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Overdue banner */}
      {overdueApps.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4">
          <h2 className="font-semibold text-red-800 mb-3">🔴 Overdue decision deadlines ({overdueApps.length})</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {overdueApps.map((app) => (
              <ApplicationCard key={app.id} application={app} />
            ))}
          </div>
        </div>
      )}

      {/* Status breakdown */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Applications by status</h2>
        <div className="flex flex-wrap gap-2">
          {byStatus.map((row) => (
            <a
              key={row.status}
              href={`/applications?status=${row.status}`}
              className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium hover:opacity-80', STATUS_COLORS[row.status])}
            >
              {STATUS_LABELS[row.status]}
              <span className="rounded-full bg-white/60 px-1.5 py-0.5 text-xs font-bold">{row._count.id}</span>
            </a>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Recently updated</h2>
          <a href="/applications" className="text-sm text-blue-600 hover:underline">View all</a>
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
