import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { PermitCard } from '@/components/PermitCard';
import { PermitPanel } from '@/components/PermitPanel';
import { PERMIT_STATUS_LABELS } from '@/lib/permit';
import { formatDate, formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function PermitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [permit, users] = await Promise.all([
    prisma.dataPermit.findUnique({
      where: { id },
      include: {
        application: {
          select: {
            id: true,
            referenceNumber: true,
            title: true,
            type: true,
            status: true,
            decisionOutcome: true,
            applicant: { select: { name: true, organisation: true, email: true } },
          },
        },
        logs: {
          include: { user: { select: { name: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),
    prisma.user.findMany({ orderBy: { name: 'asc' } }),
  ]);

  if (!permit) notFound();

  const currentUser =
    users.find(u => u.role === 'DECISION_MAKER') ??
    users.find(u => u.role === 'ADMIN') ??
    users[0];

  if (!currentUser) notFound();

  // PermitPanel needs the application with dataPermit — build a compatible object
  const fakeApplication = {
    ...permit.application,
    dataPermit: permit,
  } as Parameters<typeof PermitPanel>[0]['application'];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        <a href="/permits" className="hover:text-gray-900">Vergunningen</a>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-mono">{permit.permitNumber}</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 font-mono">{permit.permitNumber}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {permit.application?.referenceNumber} — {permit.application?.title}
          </p>
        </div>
        <a
          href={`/applications/${permit.application?.id}`}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors"
        >
          Bekijk aanvraag →
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Vergunningsgegevens</h2>
            <PermitCard permit={permit} />
          </section>

          {/* Aanvrager */}
          {permit.application?.applicant && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Aanvrager</h2>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-gray-500">Naam</dt>
                  <dd className="font-medium">{permit.application.applicant.name}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Organisatie</dt>
                  <dd className="font-medium">{permit.application.applicant.organisation}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">E-mail</dt>
                  <dd className="font-medium">{permit.application.applicant.email}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Aanvraagtype</dt>
                  <dd className="font-medium">
                    {permit.application.type === 'DATA_ACCESS_APPLICATION'
                      ? 'Data-toegangsaanvraag (Art. 46)'
                      : 'Dataverzoek (Art. 69)'}
                  </dd>
                </div>
              </dl>
            </section>
          )}

          {/* Auditlog */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Vergunningshistorie</h2>
            {permit.logs.length === 0 ? (
              <p className="text-sm text-gray-500">Geen historie.</p>
            ) : (
              <ol className="space-y-3">
                {permit.logs.map((log, i) => (
                  <li key={log.id} className="flex gap-3 text-sm">
                    <div className="flex flex-col items-center">
                      <span className="w-6 h-6 rounded-full bg-[#154273] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                        {i + 1}
                      </span>
                      {i < permit.logs.length - 1 && (
                        <div className="w-px flex-1 bg-gray-200 my-1" />
                      )}
                    </div>
                    <div className="pb-3">
                      <p className="font-medium text-gray-900">{log.action}</p>
                      {log.fromStatus && (
                        <p className="text-xs text-gray-500">
                          {PERMIT_STATUS_LABELS[log.fromStatus]} → {PERMIT_STATUS_LABELS[log.toStatus]}
                        </p>
                      )}
                      {log.comment && (
                        <p className="text-xs text-gray-600 mt-1 italic">{log.comment}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {log.user.name} · {log.user.role} · {formatDateTime(log.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Sidebar: lifecycle acties */}
        <div>
          <PermitPanel application={fakeApplication} currentUser={currentUser} />
        </div>
      </div>
    </div>
  );
}
