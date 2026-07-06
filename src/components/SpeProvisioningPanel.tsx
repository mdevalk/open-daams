'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SPE_STATUS_COLORS, SPE_STATUS_LABELS, SPE_TRANSITIONS } from '@/lib/spe';
import { readErrorMessage, formatDateTime } from '@/lib/utils';

type SpeProvisioningStatus = keyof typeof SPE_STATUS_LABELS;

type Order = {
  id: string;
  status: SpeProvisioningStatus;
  environmentReference: string | null;
  requestedAt: string;
  provisionedAt: string | null;
  decommissionedAt: string | null;
  logs: Array<{
    id: string;
    fromStatus: SpeProvisioningStatus | null;
    toStatus: SpeProvisioningStatus;
    comment: string | null;
    createdAt: string;
    user: { name: string; role: string };
  }>;
};

export function SpeProvisioningPanel({
  permitId,
  order,
  canManage,
  currentUserId,
}: {
  permitId: string;
  order: Order | null;
  canManage: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [envRef, setEnvRef] = useState('');
  const [comment, setComment] = useState('');
  const [pendingTo, setPendingTo] = useState<SpeProvisioningStatus | null>(null);

  async function requestProvisioning() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/permits/${permitId}/spe-provisioning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to request SPE provisioning'));
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function transition(toStatus: SpeProvisioningStatus) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/permits/${permitId}/spe-provisioning`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          toStatus,
          environmentReference: envRef.trim() || undefined,
          comment: comment.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to update SPE provisioning'));
      setEnvRef('');
      setComment('');
      setPendingTo(null);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 text-sm">Secure processing environment (Art. 73)</h2>
        {order && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${SPE_STATUS_COLORS[order.status]}`}>
            {SPE_STATUS_LABELS[order.status]}
          </span>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {!order && (
        canManage ? (
          <button disabled={loading} onClick={requestProvisioning} className="text-xs text-[#01689b] hover:underline">
            + Request SPE provisioning
          </button>
        ) : (
          <p className="text-xs text-gray-500">No SPE provisioning order yet.</p>
        )
      )}

      {order && (
        <div className="space-y-2 text-sm">
          {order.environmentReference && (
            <div className="flex justify-between"><span className="text-gray-500">Environment</span><span className="font-mono text-xs">{order.environmentReference}</span></div>
          )}
          <p className="text-xs text-gray-400">
            Requested {formatDateTime(order.requestedAt)}
            {order.provisionedAt && <> · Active {formatDateTime(order.provisionedAt)}</>}
            {order.decommissionedAt && <> · Decommissioned {formatDateTime(order.decommissionedAt)}</>}
          </p>

          {canManage && SPE_TRANSITIONS[order.status].length > 0 && (
            <div className="border-t border-gray-100 pt-2 space-y-2">
              <div className="flex flex-wrap gap-2">
                {SPE_TRANSITIONS[order.status].map((t) => (
                  <button
                    key={t.to}
                    disabled={loading}
                    onClick={() => setPendingTo(pendingTo === t.to ? null : t.to)}
                    className={`text-xs rounded px-2 py-1 border ${
                      pendingTo === t.to ? 'border-[#154273] bg-[#e8f4fb]' : 'border-gray-300 hover:bg-gray-50'
                    }`}
                    title={t.description}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {pendingTo && (
                <div className="space-y-2">
                  {SPE_TRANSITIONS[order.status].find((t) => t.to === pendingTo)?.requiresEnvironmentReference && (
                    <input
                      type="text"
                      value={envRef}
                      onChange={(e) => setEnvRef(e.target.value)}
                      placeholder="Environment reference / URL"
                      className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]"
                    />
                  )}
                  <textarea
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Comment (optional)"
                    className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]"
                  />
                  <button
                    disabled={loading}
                    onClick={() => transition(pendingTo)}
                    className="rounded px-3 py-1.5 text-sm font-semibold text-white bg-[#154273] hover:bg-[#01689b] disabled:opacity-50 transition-colors"
                  >
                    {loading ? 'Working...' : 'Confirm'}
                  </button>
                </div>
              )}
            </div>
          )}

          {order.logs.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-gray-500 hover:text-gray-800">History</summary>
              <ul className="mt-2 space-y-1.5">
                {order.logs.map((log) => (
                  <li key={log.id} className="text-gray-600">
                    <span className="font-medium">{SPE_STATUS_LABELS[log.toStatus]}</span>
                    {' — '}{log.user.name} ({log.user.role}) · {formatDateTime(log.createdAt)}
                    {log.comment && <div className="italic text-gray-500">{log.comment}</div>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
