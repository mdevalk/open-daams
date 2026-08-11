'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { Application, FeeEstimate, FinancialLineCategory, FinancialLineItem, Invoice, SpeOperator, User } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { formatDate, formatDateTime, readErrorMessage } from '@/lib/utils';
import { SpeType } from './SpeTypeList';
import { LINE_CATEGORY_META } from '@/lib/financial-line-items';

type Props = {
  application: Application & {
    feeEstimate:
      | (FeeEstimate & {
          invoice: Invoice | null;
          speOperator: SpeOperator | null;
          speType: SpeType | null;
          lineItems: FinancialLineItem[];
        })
      | null;
  };
  currentUser: User;
  speOperators: { id: string; name: string; types: SpeType[] }[];
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Concept',
  ISSUED: 'Verzonden',
  PAID: 'Betaald',
  CANCELLED: 'Geannuleerd',
};

const INVOICE_STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ISSUED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'In afwachting van reactie aanvrager',
  ACCEPTED: 'Geaccepteerd door aanvrager',
  REJECTED: 'Afgewezen door aanvrager',
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  ACCEPTED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
};

// Manually addable/removable rows. SPE_SETUP/SPE_USAGE are managed
// exclusively via the operator/type picker below, since their amounts are
// derived from the chosen SpeType, not typed in freely.
const MANUAL_CATEGORIES: FinancialLineCategory[] = ['ADMINISTRATIVE', 'DATA_PREPARATION', 'DATA_HOLDER', 'ADDITIONAL_SERVICES'];

type Row = { key: string; category: FinancialLineCategory; amount: string; description: string };

function fmtAmount(v: unknown, currency: string): string {
  if (v === null || v === undefined) return '—';
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency }).format(Number(v));
}

export function FeeEstimatePanel({ application, currentUser, speOperators }: Props) {
  const router = useRouter();
  const terr = useTranslations('errors');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

  const estimate = application.feeEstimate;

  const [rows, setRows] = useState<Row[]>(() =>
    (estimate?.lineItems ?? [])
      .filter((li) => li.category !== 'SPE_SETUP' && li.category !== 'SPE_USAGE')
      .map((li) => ({ key: li.id, category: li.category, amount: li.amount.toString(), description: li.description ?? '' })),
  );
  const [notes, setNotes] = useState(estimate?.notes ?? '');
  const [speOperatorId, setSpeOperatorId] = useState(estimate?.speOperatorId ?? '');
  const [speTypeId, setSpeTypeId] = useState(estimate?.speTypeId ?? '');
  const [speSetupFee, setSpeSetupFee] = useState(
    estimate?.lineItems.find((li) => li.category === 'SPE_SETUP')?.amount?.toString() ?? '',
  );
  const [speUsageFee, setSpeUsageFee] = useState(
    estimate?.lineItems.find((li) => li.category === 'SPE_USAGE')?.amount?.toString() ?? '',
  );

  const speTypes = speOperators.find((op) => op.id === speOperatorId)?.types ?? [];

  function selectSpeOperator(id: string) {
    setSpeOperatorId(id);
    setSpeTypeId('');
  }

  function selectSpeType(id: string) {
    setSpeTypeId(id);
    const type = speTypes.find((t) => t.id === id);
    if (type) {
      setSpeSetupFee(String(type.setupFee));
      setSpeUsageFee(String(type.monthlyFee));
    }
  }

  function addRow() {
    setRows((r) => [...r, { key: crypto.randomUUID(), category: 'ADMINISTRATIVE', amount: '', description: '' }]);
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: string) {
    setRows((r) => r.filter((row) => row.key !== key));
  }

  // Only relevant while the application is being assessed — unless an
  // estimate (and possibly its provisional invoice) already exists, in
  // which case it should remain visible after the decision is issued.
  if (!estimate && !['PRE_SCREENING', 'PROCESSING', 'AWAITING_ADDITIONAL_INFORMATION'].includes(application.status)) {
    return null;
  }

  const canManage = ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'].includes(currentUser.role);
  const canIssueInvoice = ['DECISION_MAKER', 'ADMIN'].includes(currentUser.role);

  async function issueProvisionalInvoice() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${application.id}/provisional-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actingUserId: currentUser.id }),
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
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actingUserId: currentUser.id, action }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : terr('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  async function sendEstimate() {
    setLoading(true);
    setError(null);
    try {
      const lineItems = [
        ...rows.filter((r) => r.amount.trim() !== '').map((r) => ({ category: r.category, amount: r.amount, description: r.description || undefined })),
        ...(speSetupFee.trim() !== '' ? [{ category: 'SPE_SETUP' as const, amount: speSetupFee }] : []),
        ...(speUsageFee.trim() !== '' ? [{ category: 'SPE_USAGE' as const, amount: speUsageFee }] : []),
      ];
      const res = await fetch(`/api/applications/${application.id}/fee-estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineItems,
          speOperatorId: speOperatorId || undefined,
          speTypeId: speTypeId || undefined,
          notes,
          actingUserId: currentUser.id,
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
      setEditing(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : terr('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  async function respond(status: 'ACCEPTED' | 'REJECTED') {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${application.id}/fee-estimate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, actingUserId: currentUser.id }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : terr('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  const showForm = editing || !estimate;
  const showSpe = application.type === 'DATA_ACCESS_APPLICATION';

  return (
    <div className="rounded border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 text-sm">Kostenraming (Art. 62 EHDS)</h2>
        {estimate && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_STYLES[estimate.status]}`}>
            {STATUS_LABELS[estimate.status]}
          </span>
        )}
      </div>

      {estimate && !showForm && (
        <div className="text-sm space-y-1">
          {estimate.lineItems.map((item) => (
            <div key={item.id} className="flex justify-between">
              <span className="text-gray-500">
                {LINE_CATEGORY_META[item.category].label}
                {(item.category === 'SPE_SETUP' || item.category === 'SPE_USAGE') && estimate.speType && ` — ${estimate.speType.name}`}
                {(item.category === 'SPE_SETUP' || item.category === 'SPE_USAGE') && estimate.speOperator && ` (${estimate.speOperator.name})`}
              </span>
              <span>{fmtAmount(item.amount, item.currency)}</span>
            </div>
          ))}
          {estimate.lineItems.map((item) =>
            item.description ? (
              <p key={`${item.id}-description`} className="text-xs text-gray-500 -mt-0.5">{item.description}</p>
            ) : null,
          )}
          <div className="flex justify-between font-semibold border-t border-gray-200 pt-1 mt-1"><span>Totaal</span><span>{fmtAmount(estimate.totalAmount, estimate.currency)}</span></div>
          {estimate.notes && <p className="text-xs text-gray-500 mt-1">{estimate.notes}</p>}
          <p className="text-xs text-gray-400 mt-1">Verzonden op {formatDateTime(estimate.sentAt)}</p>
        </div>
      )}

      {estimate && estimate.status === 'ACCEPTED' && (
        <div className="border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium text-gray-700">Voorlopige factuur</p>
            {estimate.invoice && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${INVOICE_STATUS_STYLES[estimate.invoice.status]}`}>
                {INVOICE_STATUS_LABELS[estimate.invoice.status]}
              </span>
            )}
          </div>
          {estimate.invoice ? (
            <div className="text-sm space-y-1">
              <div className="flex justify-between"><span className="text-gray-500 font-mono text-xs">{estimate.invoice.invoiceNumber}</span><span>{fmtAmount(estimate.invoice.totalAmount, estimate.invoice.currency)}</span></div>
              <p className="text-xs text-gray-400">
                Verzonden {formatDate(estimate.invoice.issuedAt)} · Vervalt {formatDate(estimate.invoice.dueAt)}
                {estimate.invoice.paidAt && <> · Betaald {formatDate(estimate.invoice.paidAt)}</>}
              </p>
              {canManage && estimate.invoice.status === 'ISSUED' && (
                <div className="flex gap-3 pt-1">
                  <button disabled={loading} onClick={() => updateInvoice(estimate.invoice!.id, 'mark_paid')} className="text-xs text-emerald-700 hover:underline">
                    Markeer als betaald
                  </button>
                  <button disabled={loading} onClick={() => updateInvoice(estimate.invoice!.id, 'cancel')} className="text-xs text-red-600 hover:underline">
                    Annuleren
                  </button>
                </div>
              )}
            </div>
          ) : (
            canIssueInvoice ? (
              <button disabled={loading} onClick={issueProvisionalInvoice} className="text-xs text-[#01689b] hover:underline">
                Voorlopige factuur uitgeven
              </button>
            ) : (
              <p className="text-xs text-gray-500">Nog geen voorlopige factuur uitgegeven.</p>
            )
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {canManage && showForm && (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.key} className="flex gap-2 items-start">
              <select
                value={row.category}
                onChange={(e) => updateRow(row.key, { category: e.target.value as FinancialLineCategory })}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]"
              >
                {MANUAL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{LINE_CATEGORY_META[cat].label}</option>
                ))}
              </select>
              <input
                type="number" step="0.01" placeholder="Bedrag (EUR)" value={row.amount}
                onChange={(e) => updateRow(row.key, { amount: e.target.value })}
                className="w-28 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <input
                type="text" placeholder="Omschrijving (optioneel)" value={row.description}
                onChange={(e) => updateRow(row.key, { description: e.target.value })}
                className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]"
              />
              <button onClick={() => removeRow(row.key)} className="text-xs text-red-600 hover:underline px-1 py-1.5" aria-label="Regel verwijderen">
                ✕
              </button>
            </div>
          ))}
          <button onClick={addRow} className="text-xs text-[#01689b] hover:underline">
            + Kostenregel toevoegen
          </button>

          {showSpe && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">SPE-operator</label>
              <select
                value={speOperatorId}
                onChange={e => selectSpeOperator(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]"
              >
                <option value="">— geen geselecteerd —</option>
                {speOperators.map(op => (
                  <option key={op.id} value={op.id}>{op.name}</option>
                ))}
              </select>
            </div>
          )}

          {showSpe && speTypes.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">SPE-type</label>
              <select
                value={speTypeId}
                onChange={e => selectSpeType(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]"
              >
                <option value="">— geen geselecteerd —</option>
                {speTypes.map(type => (
                  <option key={type.id} value={type.id}>
                    {type.name} (€{String(type.setupFee)} / €{String(type.monthlyFee)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {showSpe && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">SPE opstartkosten (EUR)</label>
                <input type="number" step="0.01" value={speSetupFee} readOnly={!!speTypeId} onChange={e => setSpeSetupFee(e.target.value)}
                  className={`w-full rounded border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b] ${
                    speTypeId ? 'border-gray-200 bg-gray-100 cursor-not-allowed' : 'border-gray-300'
                  }`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">SPE gebruikskosten (EUR)</label>
                <input type="number" step="0.01" value={speUsageFee} readOnly={!!speTypeId} onChange={e => setSpeUsageFee(e.target.value)}
                  className={`w-full rounded border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b] ${
                    speTypeId ? 'border-gray-200 bg-gray-100 cursor-not-allowed' : 'border-gray-300'
                  }`} />
              </div>
              {speTypeId && (
                <p className="col-span-2 text-xs text-gray-500 -mt-1">Afgeleid van het geselecteerde SPE-type</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Toelichting</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
          </div>
          <div className="flex gap-2">
            <button disabled={loading} onClick={sendEstimate}
              className="flex-1 rounded px-3 py-2 text-sm font-semibold text-white bg-[#154273] hover:bg-[#01689b] disabled:opacity-50 transition-colors">
              {loading ? 'Bezig...' : 'Kostenraming versturen'}
            </button>
            {estimate && (
              <button disabled={loading} onClick={() => setEditing(false)}
                className="rounded px-3 py-2 text-sm border border-gray-300 hover:bg-gray-50">
                Annuleren
              </button>
            )}
          </div>
        </div>
      )}

      {canManage && estimate && !showForm && (
        <div className="flex gap-2">
          <button onClick={() => setEditing(true)} className="text-xs text-[#01689b] hover:underline">
            Bewerken
          </button>
          {estimate.status === 'PENDING' && (
            <>
              <button disabled={loading} onClick={() => respond('ACCEPTED')} className="text-xs text-emerald-700 hover:underline">
                Markeer als geaccepteerd
              </button>
              <button disabled={loading} onClick={() => respond('REJECTED')} className="text-xs text-red-700 hover:underline">
                Markeer als afgewezen
              </button>
            </>
          )}
        </div>
      )}

      {!canManage && !estimate && (
        <p className="text-xs text-gray-500">Nog geen kostenraming verzonden.</p>
      )}
    </div>
  );
}
