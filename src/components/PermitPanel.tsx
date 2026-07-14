'use client';

import { useState } from 'react';
import { Application, DataPermit, FeeEstimate, User } from '@prisma/client';
import { PERMIT_TRANSITIONS, PERMIT_STATUS_LABELS, PERMIT_STATUS_COLORS } from '@/lib/permit';
import { PermitCard } from './PermitCard';
import { useRouter } from 'next/navigation';
import { formatDate, readErrorMessage } from '@/lib/utils';

type Props = {
  application: Pick<Application, 'id' | 'status' | 'decisionOutcome'> & { dataPermit: DataPermit | null; feeEstimate?: FeeEstimate | null };
  currentUser: User;
};

export function PermitPanel({ application, currentUser }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Issue form state
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState(
    new Date(Date.now() + 2 * 365.25 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const estimate = application.feeEstimate;
  const [permitProcessingFee, setPermitProcessingFee] = useState(estimate?.administrativeFee?.toString() ?? '');
  const [dataPreparationFee, setDataPreparationFee] = useState(estimate?.dataPreparationFee?.toString() ?? '');
  const [speSetupFee, setSpeSetupFee] = useState('');
  const [speUsageFee, setSpeUsageFee] = useState('');
  const [additionalServicesFee, setAdditionalServicesFee] = useState('');
  const [dataHolderFee, setDataHolderFee] = useState(estimate?.dataHolderFee?.toString() ?? '');
  const [paymentTerms, setPaymentTerms] = useState('');

  // Lifecycle transition state
  const [selectedTransition, setSelectedTransition] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [newValidUntil, setNewValidUntil] = useState('');
  const [revokeReason, setRevokeReason] = useState('');

  // Only show if positive decision
  if (application.status !== 'DECISION_ISSUED' || application.decisionOutcome !== 'POSITIVE') {
    return null;
  }

  const permit = application.dataPermit;

  async function issuePermit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/permits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: application.id,
          validFrom,
          validUntil,
          issuedByUserId: currentUser.id,
          permitProcessingFee,
          dataPreparationFee,
          speSetupFee,
          speUsageFee,
          additionalServicesFee,
          dataHolderFee,
          paymentTerms,
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, 'Uitgifte mislukt'));
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Onbekende fout');
    } finally {
      setLoading(false);
    }
  }

  async function applyTransition(toStatus: string) {
    if (!permit) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/permits/${permit.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toStatus,
          userId: currentUser.id,
          comment: toStatus === 'REVOKED' ? revokeReason : comment,
          validUntil: toStatus === 'RENEWED' ? newValidUntil : undefined,
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, 'Actie mislukt'));
      setSelectedTransition(null);
      setComment('');
      setRevokeReason('');
      setNewValidUntil('');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Onbekende fout');
    } finally {
      setLoading(false);
    }
  }

  // --- No permit yet: show issue form ---
  if (!permit) {
    const canIssue = ['DECISION_MAKER', 'ADMIN'].includes(currentUser.role);
    return (
      <div className="rounded border border-emerald-200 bg-emerald-50 p-5">
        <h2 className="font-semibold text-emerald-900 mb-1">Vergunning uitschrijven</h2>
        <p className="text-xs text-emerald-700 mb-4">
          Positief besluit genomen. Schrijf een EHDS-dataverwerkingsvergunning uit (D6.4 §9).
        </p>
        {canIssue ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Geldig vanaf</label>
              <input
                type="date"
                value={validFrom}
                onChange={e => setValidFrom(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Geldig tot</label>
              <input
                type="date"
                value={validUntil}
                onChange={e => setValidUntil(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]"
              />
            </div>

            <div className="border-t border-emerald-200 pt-3 space-y-2">
              <p className="text-xs font-semibold text-emerald-900">Kosten (Annex 9 §7)</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-700 mb-1">Behandelkosten</label>
                  <input type="number" step="0.01" value={permitProcessingFee} onChange={e => setPermitProcessingFee(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-700 mb-1">Gegevensvoorbereiding</label>
                  <input type="number" step="0.01" value={dataPreparationFee} onChange={e => setDataPreparationFee(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-700 mb-1">SPE opstartkosten</label>
                  <input type="number" step="0.01" value={speSetupFee} onChange={e => setSpeSetupFee(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-700 mb-1">SPE gebruikskosten</label>
                  <input type="number" step="0.01" value={speUsageFee} onChange={e => setSpeUsageFee(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-700 mb-1">Aanvullende diensten</label>
                  <input type="number" step="0.01" value={additionalServicesFee} onChange={e => setAdditionalServicesFee(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-700 mb-1">Kosten gegevenshouder(s)</label>
                  <input type="number" step="0.01" value={dataHolderFee} onChange={e => setDataHolderFee(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-700 mb-1">Betalingsvoorwaarden</label>
                <textarea rows={2} value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}
                  placeholder="Betalingstermijn, factuurproces, kortingen..."
                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
              </div>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              disabled={loading}
              onClick={issuePermit}
              className="w-full rounded px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Bezig...' : 'Vergunning uitschrijven'}
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-500">Alleen DECISION_MAKER of ADMIN kan een vergunning uitschrijven.</p>
        )}
      </div>
    );
  }

  // --- Permit exists: show card + lifecycle actions ---
  const availableTransitions = (PERMIT_TRANSITIONS[permit.status] ?? []).filter(
    t => t.requiredRole.includes(currentUser.role as 'DECISION_MAKER' | 'ADMIN' | 'CASE_HANDLER')
  );

  return (
    <div className="space-y-4">
      <div className="rounded border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Vergunning</h2>
          <a
            href={`/permits/${permit.id}`}
            className="text-xs text-[#01689b] hover:underline"
          >
            Bekijk details →
          </a>
        </div>
        <PermitCard permit={permit} compact />
      </div>

      {availableTransitions.length > 0 && (
        <div className="rounded border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Vergunningsacties</h3>
          <div className="space-y-2">
            {availableTransitions.map(t => {
              const isSelected = selectedTransition === t.to;
              const isDestructive = t.to === 'REVOKED';
              const baseStyle = isDestructive
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-gray-200 bg-gray-50 text-gray-800';
              const selectedStyle = isDestructive
                ? 'border-red-400 bg-red-100'
                : 'border-[#01689b] bg-[#e8f4fb]';

              return (
                <button
                  key={t.to}
                  onClick={() => setSelectedTransition(isSelected ? null : t.to)}
                  className={`w-full text-left rounded border px-3 py-2 text-sm transition-colors ${
                    isSelected ? selectedStyle : baseStyle
                  }`}
                >
                  <p className="font-medium">{t.label}</p>
                  <p className="text-xs opacity-70 mt-0.5">{t.description}</p>
                </button>
              );
            })}
          </div>

          {selectedTransition && (
            <div className="mt-3 space-y-2">
              {selectedTransition === 'RENEWED' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nieuwe vervaldatum</label>
                  <input
                    type="date"
                    value={newValidUntil}
                    onChange={e => setNewValidUntil(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {selectedTransition === 'REVOKED' ? 'Reden intrekking (verplicht)' : 'Toelichting'}
                </label>
                <textarea
                  rows={2}
                  value={selectedTransition === 'REVOKED' ? revokeReason : comment}
                  onChange={e =>
                    selectedTransition === 'REVOKED'
                      ? setRevokeReason(e.target.value)
                      : setComment(e.target.value)
                  }
                  placeholder={selectedTransition === 'REVOKED' ? 'Motiveer de intrekking...' : 'Optionele toelichting...'}
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]"
                />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button
                disabled={
                  loading ||
                  (selectedTransition === 'REVOKED' && !revokeReason.trim()) ||
                  (selectedTransition === 'RENEWED' && !newValidUntil)
                }
                onClick={() => applyTransition(selectedTransition)}
                className={`w-full rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors ${
                  selectedTransition === 'REVOKED'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-[#154273] hover:bg-[#01689b]'
                }`}
              >
                {loading ? 'Bezig...' : `Bevestig: ${
                  PERMIT_STATUS_LABELS[selectedTransition as keyof typeof PERMIT_STATUS_LABELS] ??
                  selectedTransition
                }`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
