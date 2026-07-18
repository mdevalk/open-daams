'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { Application, User } from '@prisma/client';
import { getAvailableTransitions, Transition } from '@/lib/workflow';
import { useRouter } from 'next/navigation';
import { readErrorMessage } from '@/lib/utils';

type Props = { application: Application; currentUser: User };

export function TransitionPanel({ application, currentUser }: Props) {
  const router = useRouter();
  const terr = useTranslations('errors');
  const [selected, setSelected] = useState<Transition | null>(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transitions = getAvailableTransitions(application.status, application.type, currentUser.role);
  if (transitions.length === 0) return null;

  async function submit() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${application.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toStatus: selected.to,
          userId: currentUser.id,
          comment,
          decisionOutcome: selected.requiresDecisionOutcome ?? null,
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
      setSelected(null);
      setComment('');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : terr('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded border border-gray-200 bg-white p-5">
      <h2 className="font-semibold text-gray-900 mb-3">Beschikbare acties</h2>
      <div className="space-y-2">
        {transitions.map((t, i) => {
          const isSelected =
            selected?.to === t.to &&
            selected?.requiresDecisionOutcome === t.requiresDecisionOutcome;

          const positiveStyle = 'border-[#39870c] bg-[#e6f5ea] text-[#1a5c2e]';
          const negativeStyle = 'border-[#d52b1e] bg-[#fce8e6] text-[#7a1711]';
          const defaultStyle  = 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-800';
          const selectedStyle = 'border-[#01689b] bg-[#e8f4fb] text-[#154273]';

          const baseStyle =
            isSelected
              ? selectedStyle
              : t.requiresDecisionOutcome === 'POSITIVE'
              ? positiveStyle
              : t.requiresDecisionOutcome === 'NEGATIVE'
              ? negativeStyle
              : defaultStyle;

          return (
            <button
              key={`${t.to}-${i}`}
              onClick={() => setSelected(isSelected ? null : t)}
              className={`w-full text-left rounded border px-4 py-3 text-sm transition-colors ${baseStyle}`}
            >
              <p className="font-medium">{t.label}</p>
              <p className="text-xs opacity-70 mt-0.5">{t.description}</p>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Toelichting
            {selected.requiresDecisionOutcome === 'NEGATIVE' &&
              <span className="text-[#d52b1e] ml-1">(verplicht bij negatief besluit)</span>}
          </label>
          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Voeg een motivering of opmerking toe..."
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]"
          />
          {error && (
            <p role="alert" className="mt-1 text-xs text-[#d52b1e]">{error}</p>
          )}
          <button
            disabled={loading}
            onClick={submit}
            className="mt-2 w-full rounded px-4 py-2 text-sm font-semibold text-white bg-[#154273] hover:bg-[#01689b] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Bezig...' : `Bevestig: ${selected.label}`}
          </button>
        </div>
      )}
    </div>
  );
}
