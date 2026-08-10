'use client';

import { useState } from 'react';
import { Application, DataPermit, FeeEstimate, User } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { PermitCard } from './PermitCard';
import { useRouter } from 'next/navigation';
import { readErrorMessage } from '@/lib/utils';
import { SpeType } from './SpeTypeList';

type Props = {
  application: Pick<Application, 'id' | 'type' | 'status' | 'decisionOutcome' | 'permitAcceptanceStatus'> & { dataPermit: DataPermit | null; feeEstimate?: FeeEstimate | null };
  currentUser: User;
  speOperators: { id: string; name: string; types: SpeType[] }[];
};

export function PermitPanel({ application, currentUser, speOperators }: Props) {
  const router = useRouter();
  const tp = useTranslations('permitPanel');
  const terr = useTranslations('errors');
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
  const [speOperatorId, setSpeOperatorId] = useState('');
  const [speTypeId, setSpeTypeId] = useState('');

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

  // Only show if positive decision
  if (application.status !== 'DECISION_ISSUED' || application.decisionOutcome !== 'POSITIVE') {
    return null;
  }

  const permit = application.dataPermit;

  // D6.4 §9.2: before a permit exists, wait for the applicant to accept the
  // pre-permit conditions — DecisionCardPanel owns the pending/declined
  // messaging for that state. Once a permit exists, keep managing its
  // lifecycle regardless (permitAcceptanceStatus stays 'ACCEPTED' forever
  // after issuance anyway).
  if (!permit && application.permitAcceptanceStatus !== 'ACCEPTED') {
    return null;
  }

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
          speOperatorId: speOperatorId || undefined,
          speTypeId: speTypeId || undefined,
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : terr('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  // --- No permit yet: show issue form ---
  if (!permit) {
    const canIssue = ['DECISION_MAKER', 'ADMIN'].includes(currentUser.role);
    return (
      <div className="rounded border border-emerald-200 bg-emerald-50 p-5">
        <h2 className="font-semibold text-emerald-900 mb-1">{tp('issueTitle')}</h2>
        <p className="text-xs text-emerald-700 mb-4">{tp('issueSubtitle')}</p>
        {canIssue ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{tp('validFrom')}</label>
              <input
                type="date"
                value={validFrom}
                onChange={e => setValidFrom(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{tp('validUntil')}</label>
              <input
                type="date"
                value={validUntil}
                onChange={e => setValidUntil(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]"
              />
            </div>

            {application.type === 'DATA_ACCESS_APPLICATION' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{tp('speOperator')}</label>
                <select
                  value={speOperatorId}
                  onChange={e => selectSpeOperator(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]"
                >
                  <option value="">{tp('speOperatorNone')}</option>
                  {speOperators.map(op => (
                    <option key={op.id} value={op.id}>{op.name}</option>
                  ))}
                </select>
              </div>
            )}

            {application.type === 'DATA_ACCESS_APPLICATION' && speTypes.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{tp('speType')}</label>
                <select
                  value={speTypeId}
                  onChange={e => selectSpeType(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]"
                >
                  <option value="">{tp('speTypeNone')}</option>
                  {speTypes.map(type => (
                    <option key={type.id} value={type.id}>
                      {type.name} (€{String(type.setupFee)} / €{String(type.monthlyFee)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="border-t border-emerald-200 pt-3 space-y-2">
              <p className="text-xs font-semibold text-emerald-900">{tp('feesTitle')}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-700 mb-1">{tp('feeSpeSetup')}</label>
                  <input type="number" step="0.01" value={speSetupFee} readOnly={!!speTypeId} onChange={e => setSpeSetupFee(e.target.value)}
                    className={`w-full rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b] ${
                      speTypeId ? 'border-gray-200 bg-gray-100 cursor-not-allowed' : 'border-gray-300'
                    }`} />
                </div>
                <div>
                  <label className="block text-xs text-gray-700 mb-1">{tp('feeSpeUsage')}</label>
                  <input type="number" step="0.01" value={speUsageFee} readOnly={!!speTypeId} onChange={e => setSpeUsageFee(e.target.value)}
                    className={`w-full rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b] ${
                      speTypeId ? 'border-gray-200 bg-gray-100 cursor-not-allowed' : 'border-gray-300'
                    }`} />
                </div>
                {speTypeId && (
                  <p className="col-span-2 text-xs text-gray-500 -mt-1">{tp('feeSpeDerivedFromType')}</p>
                )}
                <div>
                  <label className="block text-xs text-gray-700 mb-1">{tp('feeAdditional')}</label>
                  <input type="number" step="0.01" value={additionalServicesFee} onChange={e => setAdditionalServicesFee(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                </div>
              </div>
              {additionalServicesFee.trim() !== '' && Number(additionalServicesFee) >= 0 && (
                <div>
                  <label className="block text-xs text-gray-700 mb-1">{tp('paymentTerms')}</label>
                  <textarea rows={2} value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}
                    placeholder={tp('paymentTermsPlaceholder')}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
                </div>
              )}
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              disabled={loading}
              onClick={issuePermit}
              className="w-full rounded px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {loading ? tp('loading') : tp('issueButton')}
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-500">{tp('noPermission')}</p>
        )}
      </div>
    );
  }

  // --- Permit exists: show card only. Lifecycle actions (revoke/expire) now
  // live on the permit's own detail page, in PermitLifecyclePanel, alongside
  // the other permit-management panels (change requests, authorised
  // persons, invoices, SPE provisioning).
  return (
    <div className="rounded border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">{tp('title')}</h2>
      </div>
      <a href={`/permits/${permit.id}`} className="block hover:opacity-80 transition-opacity">
        <PermitCard permit={permit} compact />
      </a>
    </div>
  );
}
