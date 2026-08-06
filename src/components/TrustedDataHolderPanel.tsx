'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { readErrorMessage } from '@/lib/utils';

const MANAGE_ROLES = ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'];

type Props = {
  application: {
    id: string;
    trustedDataHolderId: string | null;
    trustedDataHolder: { name: string } | null;
  };
  dataHolders: { id: string; name: string }[];
  currentUser: { id: string; role: string };
};

export function TrustedDataHolderPanel({ application, dataHolders, currentUser }: Props) {
  const canManage = MANAGE_ROLES.includes(currentUser.role);
  const router = useRouter();
  const t = useTranslations('trustedDataHolder');
  const terr = useTranslations('errors');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(application.trustedDataHolderId ?? '');

  async function save() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${application.id}/trusted-data-holder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trustedDataHolderId: selectedId || null, actingUserId: currentUser.id }),
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

  return (
    <div className="rounded border border-gray-200 bg-white p-4 space-y-3">
      <h2 className="font-semibold text-gray-900 text-sm">{t('title')}</h2>

      {!editing && (
        <p className="text-sm">
          {application.trustedDataHolder ? application.trustedDataHolder.name : (
            <span className="text-gray-500">{t('noneSelected')}</span>
          )}
        </p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {canManage && editing && (
        <div className="space-y-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]"
          >
            <option value="">{t('noneSelected')}</option>
            {dataHolders.map((dh) => (
              <option key={dh.id} value={dh.id}>{dh.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button disabled={loading} onClick={save}
              className="flex-1 rounded px-3 py-2 text-sm font-semibold text-white bg-[#154273] hover:bg-[#01689b] disabled:opacity-50 transition-colors">
              {loading ? t('saving') : t('save')}
            </button>
            <button disabled={loading} onClick={() => { setEditing(false); setSelectedId(application.trustedDataHolderId ?? ''); }}
              className="rounded px-3 py-2 text-sm border border-gray-300 hover:bg-gray-50">
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {canManage && !editing && (
        <button onClick={() => setEditing(true)} className="text-xs text-[#01689b] hover:underline">
          {t('edit')}
        </button>
      )}
    </div>
  );
}
