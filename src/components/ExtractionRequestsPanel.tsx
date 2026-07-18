'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { DataExtractionRequest } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { formatDate, readErrorMessage } from '@/lib/utils';

type Props = {
  applicationId: string;
  currentUserId: string;
  requests: DataExtractionRequest[];
  canManage: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Aangevraagd',
  CONFIRMED: 'Bevestigd door gegevenshouder',
  DELIVERED: 'Geleverd',
  DECLINED: 'Geweigerd',
};

const STATUS_STYLES: Record<string, string> = {
  REQUESTED: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  DELIVERED: 'bg-emerald-100 text-emerald-700',
  DECLINED: 'bg-red-100 text-red-700',
};

const NEXT_STATUSES: Record<string, string[]> = {
  REQUESTED: ['CONFIRMED', 'DECLINED'],
  CONFIRMED: ['DELIVERED', 'DECLINED'],
  DELIVERED: [],
  DECLINED: [],
};

export function ExtractionRequestsPanel({ applicationId, currentUserId, requests, canManage }: Props) {
  const router = useRouter();
  const terr = useTranslations('errors');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dataHolderName, setDataHolderName] = useState('');
  const [datasetDescription, setDatasetDescription] = useState('');

  async function submitRequest() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/extraction-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataHolderName, datasetDescription, requestedById: currentUserId }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
      setDataHolderName('');
      setDatasetDescription('');
      setShowForm(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : terr('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(requestId: string, status: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/extraction-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
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
        <h2 className="font-semibold text-gray-900 text-sm">Extractieverzoeken (Art. 60, 68(7))</h2>
        {canManage && !showForm && (
          <button onClick={() => setShowForm(true)} className="text-xs text-[#01689b] hover:underline">
            + Verzoek registreren
          </button>
        )}
      </div>

      {requests.length === 0 && !showForm && (
        <p className="text-xs text-gray-500">Nog geen extractieverzoek geregistreerd.</p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="space-y-3">
        {requests.map((r) => (
          <div key={r.id} className="border border-gray-100 rounded p-3 text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-medium">{r.dataHolderName}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_STYLES[r.status]}`}>
                {STATUS_LABELS[r.status]}
              </span>
            </div>
            <p className="text-gray-700 text-xs whitespace-pre-wrap">{r.datasetDescription}</p>
            <p className="text-xs text-gray-400">Aangevraagd op {formatDate(r.requestedAt)}</p>
            {r.deliveredAt && <p className="text-xs text-gray-400">Geleverd op {formatDate(r.deliveredAt)}</p>}
            {r.deliveryNotes && <p className="text-xs text-gray-700 border-t border-gray-100 pt-1 mt-1">{r.deliveryNotes}</p>}
            {canManage && NEXT_STATUSES[r.status]?.length > 0 && (
              <div className="flex gap-2 pt-1">
                {NEXT_STATUSES[r.status].map((next) => (
                  <button
                    key={next}
                    disabled={loading}
                    onClick={() => updateStatus(r.id, next)}
                    className="text-xs text-[#01689b] hover:underline"
                  >
                    → {STATUS_LABELS[next]}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {canManage && showForm && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Gegevenshouder</label>
            <input type="text" value={dataHolderName} onChange={e => setDataHolderName(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Beschrijving van de gevraagde extractie</label>
            <textarea rows={3} value={datasetDescription} onChange={e => setDatasetDescription(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
          </div>
          <div className="flex gap-2">
            <button disabled={loading || !dataHolderName.trim() || !datasetDescription.trim()} onClick={submitRequest}
              className="flex-1 rounded px-3 py-2 text-sm font-semibold text-white bg-[#154273] hover:bg-[#01689b] disabled:opacity-50 transition-colors">
              {loading ? 'Bezig...' : 'Registreren'}
            </button>
            <button disabled={loading} onClick={() => setShowForm(false)} className="rounded px-3 py-2 text-sm border border-gray-300 hover:bg-gray-50">
              Annuleren
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
