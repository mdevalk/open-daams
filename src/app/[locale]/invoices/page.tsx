import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { InvoiceStatus } from '@prisma/client';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ISSUED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const STATUSES: InvoiceStatus[] = ['ISSUED', 'PAID', 'DRAFT', 'CANCELLED'];

function isOverdue(invoice: { status: InvoiceStatus; dueAt: Date }): boolean {
  return invoice.status === 'ISSUED' && invoice.dueAt < new Date();
}

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; overdue?: string }>;
}) {
  const { locale } = await params;
  const { status, overdue } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'invoices' });

  const invoices = await prisma.invoice.findMany({
    where: {
      ...(status ? { status: status as InvoiceStatus } : {}),
      ...(overdue ? { status: 'ISSUED', dueAt: { lt: new Date() } } : {}),
    },
    include: {
      permit: {
        select: {
          id: true,
          permitNumber: true,
          application: { select: { referenceNumber: true, title: true, applicant: { select: { name: true, organisation: true } } } },
        },
      },
      createdBy: { select: { name: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const counts = await prisma.invoice.groupBy({ by: ['status'], _count: true });
  const countMap: Record<string, number> = {};
  counts.forEach((c) => { countMap[c.status] = c._count; });
  const total = Object.values(countMap).reduce((a, b) => a + b, 0);
  const overdueCount = await prisma.invoice.count({ where: { status: 'ISSUED', dueAt: { lt: new Date() } } });

  const totals = await prisma.invoice.groupBy({ by: ['status'], _sum: { totalAmount: true } });
  const sumByStatus: Record<string, number> = {};
  totals.forEach((s) => { sumByStatus[s.status] = Number(s._sum.totalAmount ?? 0); });

  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-500">
        <span className="text-gray-900">{t('breadcrumb')}</span>
      </div>

      <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <a
          href={`/${locale}/invoices`}
          className={`rounded-lg border p-4 text-center transition-colors ${
            !status && !overdue ? 'border-[#154273] bg-[#e8f4fb]' : 'border-gray-200 bg-white hover:bg-gray-50'
          }`}
        >
          <p className="text-2xl font-bold text-[#154273]">{total}</p>
          <p className="text-xs text-gray-600 mt-1">{t('total')}</p>
        </a>
        {STATUSES.map((s) => (
          <a
            key={s}
            href={`/${locale}/invoices?status=${s}`}
            className={`rounded-lg border p-4 text-center transition-colors ${
              status === s ? 'border-[#154273] bg-[#e8f4fb]' : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}
          >
            <p className="text-2xl font-bold text-gray-900">{countMap[s] ?? 0}</p>
            <p className="text-xs text-gray-600 mt-1">{t(`status${s}`)}</p>
          </a>
        ))}
        <a
          href={`/${locale}/invoices?overdue=1`}
          className={`rounded-lg border p-4 text-center transition-colors ${
            overdue ? 'border-amber-500 bg-amber-50' : 'border-gray-200 bg-white hover:bg-gray-50'
          }`}
        >
          <p className="text-2xl font-bold text-amber-600">{overdueCount}</p>
          <p className="text-xs text-gray-600 mt-1">{t('overdue')}</p>
        </a>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">{t('outstandingAmount')}</p>
          <p className="font-semibold text-gray-900">{(sumByStatus.ISSUED ?? 0).toFixed(2)} EUR</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">{t('paidAmount')}</p>
          <p className="font-semibold text-gray-900">{(sumByStatus.PAID ?? 0).toFixed(2)} EUR</p>
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="font-medium text-gray-700">{t('noResults')}</p>
          <p className="text-sm text-gray-500 mt-1">{t('noResultsSub')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {invoices.map((invoice) => {
            const overdueRow = isOverdue(invoice);
            return (
              <a
                key={invoice.id}
                href={`/${locale}/permits/${invoice.permit.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-[#01689b] transition-colors"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <span className="font-mono text-sm font-bold text-gray-900">{invoice.invoiceNumber}</span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {invoice.permit.permitNumber} — {invoice.permit.application?.referenceNumber} — {invoice.permit.application?.title}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${
                      overdueRow ? 'bg-amber-100 text-amber-700' : STATUS_COLORS[invoice.status]
                    }`}
                  >
                    {overdueRow ? t('overdue') : t(`status${invoice.status}`)}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">{t('applicant')}</p>
                    <p className="font-medium">{invoice.permit.application?.applicant.name ?? '—'}</p>
                    <p className="text-xs text-gray-400">{invoice.permit.application?.applicant.organisation}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{t('amount')}</p>
                    <p className="font-medium">{invoice.totalAmount.toString()} {invoice.currency}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{t('dueDate')}</p>
                    <p className="font-medium">{formatDate(invoice.dueAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{t('issuedBy')}</p>
                    <p className="font-medium">{invoice.createdBy.name}</p>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
