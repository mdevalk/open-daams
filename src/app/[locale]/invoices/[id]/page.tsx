import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { InvoiceActions } from '@/components/InvoiceActions';
import { UserSwitcher } from '@/components/UserSwitcher';
import { PermitCard } from '@/components/PermitCard';
import { formatDate, serializePrisma } from '@/lib/utils';
import { formatPermitId } from '@/lib/permit';
import { InvoiceStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ISSUED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

function isOverdue(invoice: { status: InvoiceStatus; dueAt: Date }): boolean {
  return invoice.status === 'ISSUED' && invoice.dueAt < new Date();
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="font-medium text-sm">{value}</dd>
    </div>
  );
}

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; locale: string }>;
  searchParams: Promise<{ userId?: string }>;
}) {
  const { id, locale } = await params;
  const { userId: queryUserId } = await searchParams;

  const t = await getTranslations({ locale, namespace: 'invoices' });

  const [rawInvoice, users] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      include: {
        permit: {
          include: {
            application: { select: { referenceNumber: true, title: true, type: true, applicant: { select: { name: true, organisation: true, email: true } } } },
          },
        },
        application: {
          select: { id: true, referenceNumber: true, title: true, applicant: { select: { name: true, organisation: true, email: true } } },
        },
        createdBy: { select: { name: true, role: true } },
      },
    }),
    prisma.user.findMany({ orderBy: { name: 'asc' } }),
  ]);

  if (!rawInvoice) notFound();

  const invoice = serializePrisma(rawInvoice);

  const currentUser =
    (queryUserId ? users.find((u) => u.id === queryUserId) : null) ??
    users.find((u) => u.role === 'DECISION_MAKER') ??
    users.find((u) => u.role === 'ADMIN') ??
    users[0];

  if (!currentUser) notFound();

  const canManage = ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'].includes(currentUser.role);
  const applicant = invoice.permit?.application?.applicant ?? invoice.application?.applicant;
  const overdue = isOverdue(invoice);
  const lineItems = invoice.lineItems as { description: string; amount: string }[];

  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-500">
        <a href={`/${locale}/invoices`} className="hover:text-gray-900">{t('breadcrumb')}</a>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-mono">{invoice.invoiceNumber}</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 font-mono flex items-center gap-2">
            {invoice.invoiceNumber}
            {invoice.provisional && (
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-700">
                {t('provisional')}
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
          <p className="text-sm text-gray-500 mt-1">
            {invoice.permit
              ? `${formatPermitId(invoice.permit.permitNumber, invoice.permit.version)} — ${invoice.permit.application?.referenceNumber} — ${invoice.permit.application?.title}`
              : `${invoice.application?.referenceNumber} — ${invoice.application?.title}`}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded px-2 py-1 text-xs font-semibold ${
            overdue ? 'bg-amber-100 text-amber-700' : STATUS_COLORS[invoice.status]
          }`}
        >
          {overdue ? t('overdue') : t(`status${invoice.status}`)}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-4">{t('detailsTitle')}</h2>
            <dl className="grid grid-cols-2 gap-4">
              <Field label={t('applicant')} value={applicant ? `${applicant.name} (${applicant.organisation})` : null} />
              <Field label={t('issuedBy')} value={`${invoice.createdBy.name} (${invoice.createdBy.role})`} />
              <Field label={t('issuedOn')} value={formatDate(invoice.issuedAt)} />
              <Field label={t('dueOn')} value={formatDate(invoice.dueAt)} />
              {invoice.paidAt && <Field label={t('paidOn')} value={formatDate(invoice.paidAt)} />}
            </dl>
            {!invoice.permit && invoice.application && (
              <a href={`/${locale}/applications/${invoice.application.id}`} className="inline-block mt-4 text-sm text-[#01689b] hover:underline">
                {t('viewApplication')}
              </a>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-4">{t('lineItemsTitle')}</h2>
            <ul className="text-sm divide-y divide-gray-100">
              {lineItems.map((item, i) => (
                <li key={i} className="flex justify-between py-2">
                  <span className="text-gray-700">{item.description}</span>
                  <span className="font-medium">{item.amount} {invoice.currency}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between text-base font-semibold border-t border-gray-200 pt-3 mt-1">
              <span>{t('total')}</span>
              <span>{invoice.totalAmount.toString()} {invoice.currency}</span>
            </div>
          </section>

          {invoice.notes && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900 mb-3">{t('notes')}</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{invoice.notes}</p>
            </section>
          )}
        </div>

        <div className="space-y-6">
          {invoice.permit && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900 mb-3">{t('permitTitle')}</h2>
              <a href={`/${locale}/permits/${invoice.permit.id}`} className="block hover:opacity-80 transition-opacity">
                <PermitCard permit={invoice.permit} compact />
              </a>
            </section>
          )}
          {canManage && invoice.status === 'ISSUED' && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900 mb-3">{t('panelTitle')}</h2>
              <InvoiceActions invoiceId={invoice.id} currentUserId={currentUser.id} />
            </section>
          )}
          <UserSwitcher users={users} currentUserId={currentUser.id} />
        </div>
      </div>
    </div>
  );
}
