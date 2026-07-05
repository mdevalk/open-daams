'use client';

import { useState } from 'react';
import { Application, FeeEstimate, User } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { formatDateTime, readErrorMessage } from '@/lib/utils';

type Props = {
  application: Application & { feeEstimate: FeeEstimate | null };
  currentUser: User;
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

function fmtAmount(v: unknown, currency: string): string {
  if (v === null || v === undefined) return '—';
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency }).format(Number(v));
}

export function FeeEstimatePanel({ application, currentUser }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

  const estimate = application.feeEstimate;

  const [administrativeFee, setAdministrativeFee] = useState(estimate?.administrativeFee?.toString() ?? '');
  const [dataPreparationFee, setDataPreparationFee] = useState(estimate?.dataPreparationFee?.toString() ?? '');
  const [dataHolderFee, setDataHolderFee] = useState(estimate?.dataHolderFee?.toString() ?? '');
  const [notes, setNotes] = useState(estimate?.notes ?? '');

  // Only relevant while the application is still being assessed
  if (!['PRE_SCREENING', 'PROCESSING', 'AWAITING_ADDITIONAL_INFORMATION'].includes(application.status)) {
    return null;
  }

  const canManage = ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'].includes(currentUser.role);

  async function sendEstimate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${application.id}/fee-estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ administrativeFee, dataPreparationFee, dataHolderFee, notes, actingUserId: currentUser.id }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, 'Versturen kostenraming mislukt'));
      setEditing(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Onbekende fout');
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
      if (!res.ok) throw new Error(await readErrorMessage(res, 'Bijwerken mislukt'));
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Onbekende fout');
    } finally {
      setLoading(false);
    }
  }

  const showForm = editing || !estimate;

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
          <div className="flex justify-between"><span className="text-gray-500">Behandelkosten</span><span>{fmtAmount(estimate.administrativeFee, estimate.currency)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Gegevensvoorbereiding</span><span>{fmtAmount(estimate.dataPreparationFee, estimate.currency)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Kosten gegevenshouder(s)</span><span>{fmtAmount(estimate.dataHolderFee, estimate.currency)}</span></div>
          <div className="flex justify-between font-semibold border-t border-gray-200 pt-1 mt-1"><span>Totaal</span><span>{fmtAmount(estimate.totalAmount, estimate.currency)}</span></div>
          {estimate.notes && <p className="text-xs text-gray-500 mt-1">{estimate.notes}</p>}
          <p className="text-xs text-gray-400 mt-1">Verzonden op {formatDateTime(estimate.sentAt)}</p>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {canManage && showForm && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Behandelkosten (EUR)</label>
            <input type="number" step="0.01" value={administrativeFee} onChange={e => setAdministrativeFee(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Gegevensvoorbereiding (EUR)</label>
            <input type="number" step="0.01" value={dataPreparationFee} onChange={e => setDataPreparationFee(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Kosten gegevenshouder(s) (EUR)</label>
            <input type="number" step="0.01" value={dataHolderFee} onChange={e => setDataHolderFee(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
          </div>
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
