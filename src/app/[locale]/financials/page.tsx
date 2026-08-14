import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { InvoiceStatus, FeeEstimateStatus, InvoiceRecipientType } from '@prisma/client';
import { formatDateTime } from '@/lib/utils';
import { formatPermitId } from '@/lib/permit';

export const dynamic = 'force-dynamic';

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ISSUED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const ESTIMATE_STATUS_COLORS: Record<FeeEstimateStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  ACCEPTED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const STATUSES: InvoiceStatus[] = ['ISSUED', 'PAID', 'DRAFT', 'CANCELLED'];

function isOverdue(invoice: { status: InvoiceStatus; dueAt: Date }): boolean {
  return invoice.status === 'ISSUED' && invoice.dueAt < new Date();
}

function recipientLabel(
  invoice: { recipientType: InvoiceRecipientType; recipientName: string | null },
  t: (key: string, values?: Record<string, string>) => string,
): string {
  if (invoice.recipientType === 'DATA_HOLDER') return t('recipientDataHolder', { name: invoice.recipientName ?? '—' });
  if (invoice.recipientType === 'SPE_OPERATOR') return t('recipientSpeOperator', { name: invoice.recipientName ?? '—' });
  return t('recipientApplicant');
}

export default async function FinancialsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; status?: string; overdue?: string }>;
}) {
  const { locale } = await params;
  const { tab: rawTab, status, overdue } = await searchParams;
  const tab = rawTab === 'invoices' ? 'invoices' : 'estimates';
  const t = await getTranslations({ locale, namespace: 'invoices' });

  const tabs = (
    <div className="flex gap-1 border-b border-gray-200">
      <a
        href={`/${locale}/financials`}
        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
          tab === 'estimates' ? 'border-[#154273] text-[#154273]' : 'border-transparent text-gray-500 hover:text-gray-700'
        }`}
      >
        {t('tabEstimates')}
      </a>
      <a
        href={`/${locale}/financials?tab=invoices`}
        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
          tab === 'invoices' ? 'border-[#154273] text-[#154273]' : 'border-transparent text-gray-500 hover:text-gray-700'
        }`}
      >
        {t('tabInvoices')}
      </a>
    </div>
  );

  if (tab !== 'invoices') {
    const estimates = await prisma.feeEstimate.findMany({
      include: {
        application: { select: { id: true, referenceNumber: true, title: true, applicant: { select: { name: true, dataUser: { select: { name: true } } } } } },
      },
      orderBy: { sentAt: 'desc' },
    });

    return (
      <div className="space-y-6">
        <div className="border-b border-gray-200 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
        </div>
        {tabs}
        {estimates.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
            <p className="font-medium text-gray-700">{t('estimatesNoResults')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {estimates.map((estimate) => (
              <a
                key={estimate.id}
                href={`/${locale}/applications/${estimate.application.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-[#01689b] transition-colors"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <span className="font-mono text-sm font-bold text-gray-900">{estimate.application.referenceNumber}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{estimate.application.title}</p>
                  </div>
                  <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${ESTIMATE_STATUS_COLORS[estimate.status]}`}>
                    {t(`estimateStatus${estimate.status}`)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">{t('applicant')}</p>
                    <p className="font-medium">{estimate.application.applicant.name}</p>
                    <p className="text-xs text-gray-400">{estimate.application.applicant.dataUser?.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{t('amount')}</p>
                    <p className="font-medium">{estimate.totalAmount.toString()} {estimate.currency}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{t('sentOn')}</p>
                    <p className="font-medium">{formatDateTime(estimate.sentAt)}</p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

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
          version: true,
          application: { select: { referenceNumber: true, title: true, applicant: { select: { name: true, dataUser: { select: { name: true } } } } } },
        },
      },
      application: {
        select: { id: true, referenceNumber: true, title: true, applicant: { select: { name: true, dataUser: { select: { name: true } } } } },
      },
      createdBy: { select: { name: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Group invoices issued together — a permit's "Issue invoices" click can
  // produce one applicant invoice plus one self-billing invoice per data
  // holder/SPE operator, and those belong together visually. Grouped by
  // permitId when set, falling back to applicationId for provisional
  // (pre-permit) invoices, which are always solo. Iterating the
  // already createdAt-desc-sorted list and using a Map preserves "most
  // recently active permit first" group ordering for free.
  type InvoiceRow = (typeof invoices)[number];
  const groupsMap = new Map<string, { key: string; permit: InvoiceRow['permit']; reference: string; invoices: InvoiceRow[] }>();
  for (const invoice of invoices) {
    const key = invoice.permit ? `permit-${invoice.permit.id}` : `application-${invoice.application?.id}`;
    let group = groupsMap.get(key);
    if (!group) {
      const applicant = invoice.permit?.application?.applicant ?? invoice.application?.applicant;
      const reference = invoice.permit
        ? `${invoice.permit.application?.referenceNumber} — ${invoice.permit.application?.title}`
        : `${invoice.application?.referenceNumber} — ${invoice.application?.title}`;
      group = { key, permit: invoice.permit, reference: `${applicant?.name ?? '—'} — ${reference}`, invoices: [] };
      groupsMap.set(key, group);
    }
    group.invoices.push(invoice);
  }
  const invoiceGroups = [...groupsMap.values()];

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
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
      </div>
      {tabs}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <a
          href={`/${locale}/financials?tab=invoices`}
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
            href={`/${locale}/financials?tab=invoices&status=${s}`}
            className={`rounded-lg border p-4 text-center transition-colors ${
              status === s ? 'border-[#154273] bg-[#e8f4fb]' : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}
          >
            <p className="text-2xl font-bold text-gray-900">{countMap[s] ?? 0}</p>
            <p className="text-xs text-gray-600 mt-1">{t(`status${s}`)}</p>
          </a>
        ))}
        <a
          href={`/${locale}/financials?tab=invoices&overdue=1`}
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
          {invoiceGroups.map((group) => (
            <div key={group.key} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                {group.permit ? (
                  <a href={`/${locale}/permits/${group.permit.id}`} className="font-mono text-sm font-bold text-gray-900 hover:underline">
                    {formatPermitId(group.permit.permitNumber, group.permit.version)}
                  </a>
                ) : (
                  <span className="font-mono text-sm font-bold text-gray-900">{t('provisional')}</span>
                )}
                <span className="text-xs text-gray-500 ml-2">{group.reference}</span>
              </div>
              <ul className="divide-y divide-gray-100">
                {group.invoices.map((invoice) => {
                  const overdueRow = isOverdue(invoice);
                  return (
                    <li key={invoice.id}>
                      <a
                        href={`/${locale}/financials/${invoice.id}`}
                        className="flex items-center justify-between gap-4 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-xs font-medium text-gray-700 flex-shrink-0">{invoice.invoiceNumber}</span>
                          <span className="text-xs text-gray-500 truncate">{recipientLabel(invoice, t)}</span>
                          {invoice.recipientType !== 'APPLICANT' && (
                            <span className="flex-shrink-0 inline-flex items-center rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-xs font-medium">
                              {t('selfBilled')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-sm font-medium text-gray-900">{invoice.totalAmount.toString()} {invoice.currency}</span>
                          <span
                            className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${
                              overdueRow ? 'bg-amber-100 text-amber-700' : STATUS_COLORS[invoice.status]
                            }`}
                          >
                            {overdueRow ? t('overdue') : t(`status${invoice.status}`)}
                          </span>
                        </div>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
