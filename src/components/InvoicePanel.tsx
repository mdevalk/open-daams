'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { readErrorMessage, formatDate } from '@/lib/utils';

type InvoiceLineItem = { description: string; amount: string };

type Invoice = {
  id: string;
  invoiceNumber: string;
  currency: string;
  lineItems: InvoiceLineItem[];
  totalAmount: string;
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
  createdBy: { name: string; role: string };
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
  invoices,
  canIssue,
  canManage,
  currentUserId,
  hasFeesRecorded,
}: {
  permitId: string;
  invoices: Invoice[];
  canIssue: boolean;
  canManage: boolean;
  currentUserId: string;
  hasFeesRecorded: boolean;
}) {
  const router = useRouter();
  const t = useTranslations('invoices');
  const terr = useTranslations('errors');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function issueInvoice() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/permits/${permitId}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : terr('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  async function updateInvoice(invoiceId: string, action: 'mark_paid' | 'cancel') {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/permits/${permitId}/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, action }),
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
        {canIssue && (
          <button
            disabled={loading || !hasFeesRecorded}
            onClick={issueInvoice}
            title={hasFeesRecorded ? undefined : t('issueDisabled')}
            className="text-xs text-[#01689b] hover:underline disabled:opacity-40 disabled:no-underline"
          >
            {t('issue')}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {invoices.length === 0 ? (
        <p className="text-xs text-gray-500">{t('empty')}</p>
      ) : (
        <ul className="space-y-3">
          {invoices.map((invoice) => {
            const overdue = isOverdue(invoice);
            return (
              <li key={invoice.id} className="border border-gray-100 rounded p-3 text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-medium">{invoice.invoiceNumber}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      overdue ? 'bg-amber-100 text-amber-700' : STATUS_STYLES[invoice.status]
                    }`}
                  >
                    {overdue ? t('overdue') : t(`status${invoice.status}`)}
                  </span>
                </div>

                <ul className="text-xs text-gray-600 space-y-0.5">
                  {invoice.lineItems.map((item, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{item.description}</span>
                      <span>{item.amount} {invoice.currency}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between text-sm font-semibold border-t border-gray-100 pt-1">
                  <span>{t('total')}</span>
                  <span>{invoice.totalAmount} {invoice.currency}</span>
                </div>

                <p className="text-xs text-gray-400">
                  {t('issuedOn')} {formatDate(invoice.issuedAt)} · {t('dueOn')} {formatDate(invoice.dueAt)}
                  {invoice.paidAt && <> · {t('paidOn')} {formatDate(invoice.paidAt)}</>}
                </p>
                <p className="text-xs text-gray-400">{t('issuedBy')} {invoice.createdBy.name} ({invoice.createdBy.role})</p>

                {canManage && invoice.status === 'ISSUED' && (
                  <div className="flex gap-3 pt-1">
                    <button
                      disabled={loading}
                      onClick={() => updateInvoice(invoice.id, 'mark_paid')}
                      className="text-xs text-emerald-700 hover:underline"
                    >
                      {t('markPaid')}
                    </button>
                    <button
                      disabled={loading}
                      onClick={() => updateInvoice(invoice.id, 'cancel')}
                      className="text-xs text-red-600 hover:underline"
                    >
                      {t('cancelInvoice')}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
