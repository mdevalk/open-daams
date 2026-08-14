'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { readErrorMessage } from '@/lib/utils';

type Invoice = {
  id: string;
  invoiceNumber: string;
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';
  dueAt: string;
};

const STATUS_STYLES: Record<Invoice['status'], string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ISSUED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

function isOverdue(invoice: Invoice): boolean {
  return invoice.status === 'ISSUED' && new Date(invoice.dueAt) < new Date();
}

export function InvoicePanel({
  permitId,
  locale,
  invoices,
  canIssue,
  currentUserId,
  hasInvoiceableAmounts,
}: {
  permitId: string;
  locale: string;
  invoices: Invoice[];
  canIssue: boolean;
  currentUserId: string;
  hasInvoiceableAmounts: boolean;
}) {
  const router = useRouter();
  const t = useTranslations('invoices');
  const terr = useTranslations('errors');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function issueInvoices() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/permits/${permitId}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actingUserId: currentUserId }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : terr('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 text-sm">{t('panelTitle')}</h2>
        <div className="flex items-center gap-3">
          {invoices.length > 0 && (
            <a
              href={`/${locale}/financials?tab=invoices&permitId=${permitId}`}
              className="text-xs text-[#01689b] hover:underline"
            >
              {t('viewPermitInvoices')}
            </a>
          )}
          {canIssue && (
            <button
              disabled={loading || !hasInvoiceableAmounts}
              onClick={issueInvoices}
              title={hasInvoiceableAmounts ? undefined : t('issueDisabled')}
              className="text-xs text-[#01689b] hover:underline disabled:opacity-40 disabled:no-underline"
            >
              {t('issue')}
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {invoices.length === 0 ? (
        <p className="text-xs text-gray-500">{t('empty')}</p>
      ) : (
        <ul className="space-y-2">
          {invoices.map((invoice) => {
            const overdue = isOverdue(invoice);
            return (
              <li key={invoice.id} className="border border-gray-100 rounded p-3 text-sm flex items-center justify-between">
                <a
                  href={`/${locale}/financials/${invoice.id}`}
                  className="font-mono font-medium text-[#01689b] hover:underline"
                >
                  {invoice.invoiceNumber}
                </a>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    overdue ? 'bg-amber-100 text-amber-700' : STATUS_STYLES[invoice.status]
                  }`}
                >
                  {overdue ? t('overdue') : t(`status${invoice.status}`)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
