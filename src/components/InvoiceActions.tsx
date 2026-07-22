'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { readErrorMessage } from '@/lib/utils';

export function InvoiceActions({
  invoiceId,
  currentUserId,
}: {
  invoiceId: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const t = useTranslations('invoices');
  const terr = useTranslations('errors');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateInvoice(action: 'mark_paid' | 'cancel') {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
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
    <div className="space-y-2">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button
          disabled={loading}
          onClick={() => updateInvoice('mark_paid')}
          className="text-sm text-emerald-700 hover:underline disabled:opacity-50"
        >
          {t('markPaid')}
        </button>
        <button
          disabled={loading}
          onClick={() => updateInvoice('cancel')}
          className="text-sm text-red-600 hover:underline disabled:opacity-50"
        >
          {t('cancelInvoice')}
        </button>
      </div>
    </div>
  );
}
