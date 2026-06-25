'use client';

import { useState } from 'react';
import { Application, User } from '@prisma/client';
import { getAvailableTransitions, Transition } from '@/lib/workflow';
import { useRouter } from 'next/navigation';

type Props = {
  application: Application;
  currentUser: User;
};

export function TransitionPanel({ application, currentUser }: Props) {
  const router = useRouter();
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
        body: JSON.stringify({ toStatus: selected.to, userId: currentUser.id, comment }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Transition failed');
      }
      setSelected(null);
      setComment('');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="font-semibold text-gray-900 mb-3">Available actions</h2>
      <div className="space-y-2">
        {transitions.map((t) => (
          <button
            key={t.to}
            onClick={() => setSelected(selected?.to === t.to ? null : t)}
            className={`w-full text-left rounded-lg border px-4 py-3 text-sm transition-colors ${
              selected?.to === t.to
                ? 'border-blue-500 bg-blue-50 text-blue-900'
                : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-800'
            }`}
          >
            <p className="font-medium">{t.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
          </button>
        ))}
      </div>

      {selected && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Comment {['INCOMPLETE', 'PERMIT_REFUSED', 'REQUEST_REJECTED', 'INADMISSIBLE'].includes(selected.to) && '(required)'}
          </label>
          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment or reason..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          <button
            disabled={loading}
            onClick={submit}
            className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Processing...' : `Confirm: ${selected.label}`}
          </button>
        </div>
      )}
    </div>
  );
}
