import { prisma } from '@/lib/db';
import { ApplicationCard } from '@/components/ApplicationCard';
import { STATUS_LABELS } from '@/lib/workflow';
import { ApplicationStatus, ApplicationType } from '@prisma/client';

export const dynamic = 'force-dynamic';

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; search?: string; source?: string }>;
}) {
  const params = await searchParams;
  const status = params.status as ApplicationStatus | undefined;
  const type = params.type as ApplicationType | undefined;
  const search = params.search;
  const source = params.source as 'NATIONAL' | 'HDEU' | undefined;

  const applications = await prisma.application.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(source ? { source } : {}),
      ...(search ? {
        OR: [
          { referenceNumber: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    },
    include: {
      applicant: { select: { name: true, organisation: true } },
      caseHandler: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const allStatuses = Object.keys(STATUS_LABELS) as ApplicationStatus[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Applications</h1>
        <div className="flex gap-2">
          <a href="/import" className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100">
            HD@EU import
          </a>
          <a href="/applications/new" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            + New application
          </a>
        </div>
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Search</label>
          <input
            name="search"
            defaultValue={search}
            placeholder="Reference or title..."
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
          <select name="status" defaultValue={status ?? ''} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All statuses</option>
            {allStatuses.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
          <select name="type" defaultValue={type ?? ''} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All types</option>
            <option value="DATA_ACCESS_APPLICATION">Data Permit (Art. 67)</option>
            <option value="DATA_REQUEST">Data Request (Art. 69)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
          <select name="source" defaultValue={source ?? ''} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All sources</option>
            <option value="NATIONAL">National</option>
            <option value="HDEU">HD@EU (cross-border)</option>
          </select>
        </div>
        <button type="submit" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100">Filter</button>
        {(status || type || search || source) && (
          <a href="/applications" className="text-sm text-blue-600 hover:underline self-end pb-0.5">Clear</a>
        )}
      </form>

      {applications.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
          <p className="text-gray-500">No applications found.</p>
          <a href="/applications/new" className="mt-2 inline-block text-sm text-blue-600 hover:underline">Create one</a>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {applications.map((app) => (
            <ApplicationCard key={app.id} application={app} />
          ))}
        </div>
      )}
    </div>
  );
}
