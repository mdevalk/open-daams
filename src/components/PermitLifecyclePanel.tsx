'use client';

import { useState } from 'react';
import { DataPermitStatus, UserRole } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { PERMIT_TRANSITIONS } from '@/lib/permit';
import { readErrorMessage } from '@/lib/utils';

type Props = {
  permitId: string;
  permitStatus: DataPermitStatus;
  currentUserId: string;
  currentUserRole: UserRole;
};

// Direct HDAB lifecycle actions on the permit itself — revoke (enforcement)
// and expire (validity date passed). Distinct from PermitChangeRequestPanel,
// which handles data-user-initiated requests (amendment/renewal/revocation
// appeal) that need approval. Lives on the permit's own detail page,
// alongside the other permit-management panels.
export function PermitLifecyclePanel({ permitId, permitStatus, currentUserId, currentUserRole }: Props) {
  const router = useRouter();
  const tp = useTranslations('permitPanel');
  const tps = useTranslations('permitStatus');
  const ttr = useTranslations('permitTransitions');
  const terr = useTranslations('errors');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTransition, setSelectedTransition] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [revokeReason, setRevokeReason] = useState('');

  const availableTransitions = (PERMIT_TRANSITIONS[permitStatus] ?? []).filter(
    tr => tr.requiredRole.includes(currentUserRole)
  );

  if (availableTransitions.length === 0) return null;

  async function applyTransition(toStatus: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/permits/${permitId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toStatus,
          actingUserId: currentUserId,
          comment: toStatus === 'REVOKED' ? revokeReason : comment,
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
      setSelectedTransition(null);
      setComment('');
      setRevokeReason('');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : terr('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">{tp('actionsTitle')}</h3>
      <div className="space-y-2">
        {availableTransitions.map(tr => {
          const isSelected = selectedTransition === tr.to;
          const isDestructive = tr.to === 'REVOKED';
          const baseStyle = isDestructive
            ? 'border-red-200 bg-red-50 text-red-800'
            : 'border-gray-200 bg-gray-50 text-gray-800';
          const selectedStyle = isDestructive
            ? 'border-red-400 bg-red-100'
            : 'border-[#01689b] bg-[#e8f4fb]';

          return (
            <button
              key={tr.to}
              onClick={() => setSelectedTransition(isSelected ? null : tr.to)}
              className={`w-full text-left rounded border px-3 py-2 text-sm transition-colors ${
                isSelected ? selectedStyle : baseStyle
              }`}
            >
              <p className="font-medium">{ttr(tr.label)}</p>
              <p className="text-xs opacity-70 mt-0.5">{ttr(tr.description)}</p>
            </button>
          );
        })}
      </div>

      {selectedTransition && (
        <div className="mt-3 space-y-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {selectedTransition === 'REVOKED' ? tp('revocationReason') : tp('comment')}
            </label>
            <textarea
              rows={2}
              value={selectedTransition === 'REVOKED' ? revokeReason : comment}
              onChange={e =>
                selectedTransition === 'REVOKED'
                  ? setRevokeReason(e.target.value)
                  : setComment(e.target.value)
              }
              placeholder={selectedTransition === 'REVOKED' ? tp('revocationPlaceholder') : tp('commentPlaceholder')}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            disabled={
              loading ||
              (selectedTransition === 'REVOKED' && !revokeReason.trim())
            }
            onClick={() => applyTransition(selectedTransition)}
            className={`w-full rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors ${
              selectedTransition === 'REVOKED'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[#154273] hover:bg-[#01689b]'
            }`}
          >
            {loading ? tp('loading') : `${tp('confirm')}: ${tps(selectedTransition)}`}
          </button>
        </div>
      )}
    </div>
  );
}
