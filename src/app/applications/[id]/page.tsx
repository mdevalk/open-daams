import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { StatusBadge } from '@/components/StatusBadge';
import { DeadlineBanner } from '@/components/DeadlineBanner';
import { WorkflowTimeline } from '@/components/WorkflowTimeline';
import { TransitionPanel } from '@/components/TransitionPanel';
import { NotesList } from '@/components/NotesList';
import { formatDate, formatDateTime, purposeLabel } from '@/lib/utils';
import { STATUS_LABELS } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [application, users] = await Promise.all([
    prisma.application.findUnique({
      where: { id },
      include: {
        applicant: true,
        caseHandler: true,
        auditLogs: {
          include: { user: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
        notes: {
          include: { author: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: 'desc' },
        },
        documents: { orderBy: { uploadedAt: 'desc' } },
      },
    }),
    prisma.user.findMany({ orderBy: { name: 'asc' } }),
  ]);

  if (!application) notFound();

  // For demo: use the first HDAB staff user as the "current user"
  // In production this would come from the session
  const currentUser =
    users.find((u) => u.role === 'CASE_HANDLER') ??
    users.find((u) => u.role === 'DECISION_MAKER') ??
    users[0];

  if (!currentUser) notFound();

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        <a href="/applications" className="hover:text-gray-900">Applications</a>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{application.referenceNumber}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">{application.title}</h1>
            <StatusBadge status={application.status} />
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {application.referenceNumber} &middot;{' '}
            {application.type === 'DATA_ACCESS_APPLICATION' ? 'Data Permit Application (Art. 46)' : 'Data Request (Art. 69)'}
          </p>
        </div>
        {application.status === 'DRAFT' && (
          <a
            href={`/applications/${application.id}/edit`}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100"
          >
            Edit
          </a>
        )}
      </div>

      {/* Deadline banners */}
      <div className="space-y-2">
        <DeadlineBanner label="Decision deadline (Art. 46)" deadline={application.decisionDeadline} />
        <DeadlineBanner label="Response deadline (incomplete)" deadline={application.incompleteDeadline} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">

          {/* Application details */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Application details</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Applicant</dt>
                <dd className="font-medium">{application.applicant.name}</dd>
                <dd className="text-gray-500">{application.applicant.organisation}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Case handler</dt>
                <dd className="font-medium">{application.caseHandler?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Purpose (Art. 34)</dt>
                <dd className="font-medium">{purposeLabel(application.purposeCategory)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Legal basis</dt>
                <dd className="font-medium">{application.legalBasis || '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Cross-border</dt>
                <dd className="font-medium">{application.isCrossBorder ? 'Yes' : 'No'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Processing country</dt>
                <dd className="font-medium">{application.dataProcessingCountry}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Data period</dt>
                <dd className="font-medium">
                  {formatDate(application.dataStartDate)} – {formatDate(application.dataEndDate)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Project period</dt>
                <dd className="font-medium">
                  {formatDate(application.projectStartDate)} – {formatDate(application.projectEndDate)}
                </dd>
              </div>
              {application.submittedAt && (
                <div>
                  <dt className="text-gray-500">Submitted</dt>
                  <dd className="font-medium">{formatDateTime(application.submittedAt)}</dd>
                </div>
              )}
              {application.permitNumber && (
                <div>
                  <dt className="text-gray-500">Permit number</dt>
                  <dd className="font-medium font-mono">{application.permitNumber}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* Requested datasets */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Requested datasets</h2>
            <div className="flex flex-wrap gap-2">
              {application.requestedDatasets.map((ds) => (
                <span key={ds} className="rounded-full bg-blue-50 text-blue-700 text-xs px-3 py-1 font-medium">{ds}</span>
              ))}
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Requested variables</p>
                <p className="text-gray-800">{application.requestedVariables || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Study population</p>
                <p className="text-gray-800">{application.studyPopulation || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Inclusion criteria</p>
                <p className="text-gray-800">{application.inclusionCriteria || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Exclusion criteria</p>
                <p className="text-gray-800">{application.exclusionCriteria || '—'}</p>
              </div>
            </div>
          </section>

          {/* Project description */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Project description</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{application.projectDescription}</p>
          </section>

          {/* Decision */}
          {application.decisionSummary && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Decision</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{application.decisionSummary}</p>
              {application.permitValidFrom && (
                <p className="text-xs text-gray-500 mt-2">
                  Valid: {formatDate(application.permitValidFrom)} – {formatDate(application.permitValidUntil)}
                </p>
              )}
            </section>
          )}

          {/* Notes */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Notes</h2>
            <NotesList applicationId={application.id} notes={application.notes} currentUser={currentUser} />
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Workflow actions */}
          <TransitionPanel application={application} currentUser={currentUser} />

          {/* Audit timeline */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-4">History</h2>
            <WorkflowTimeline logs={application.auditLogs} />
          </section>
        </div>
      </div>
    </div>
  );
}
