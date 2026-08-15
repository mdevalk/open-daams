'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { readErrorMessage } from '@/lib/utils';
import { SpeTypeList, SpeType } from './SpeTypeList';

type Entity = {
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  speProvider?: { name: string } | null;
  speProviderId?: string | null;
  isTrusted?: boolean;
  types?: SpeType[];
};

type Props = {
  apiBasePath: string;
  namespace: string;
  entities: Entity[];
  relationOptions?: { id: string; name: string }[];
  hasTrustedFlag?: boolean;
  hasSpeTypes?: boolean;
  isAdmin: boolean;
  currentUserId: string;
};

const inputCls =
  'w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]';

export function MasterdataManager({ apiBasePath, namespace, entities, relationOptions, hasTrustedFlag, hasSpeTypes, isAdmin, currentUserId }: Props) {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useTranslations(namespace as any);
  const terr = useTranslations('errors');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editProviderId, setEditProviderId] = useState('');
  const [editTrusted, setEditTrusted] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newProviderId, setNewProviderId] = useState('');
  const [newTrusted, setNewTrusted] = useState(false);

  function startEdit(entity: Entity) {
    setEditingId(entity.id);
    setEditName(entity.name);
    setEditEmail(entity.contactEmail ?? '');
    setEditPhone(entity.contactPhone ?? '');
    setEditProviderId(entity.speProviderId ?? '');
    setEditTrusted(entity.isTrusted ?? false);
    setError(null);
  }

  async function saveEdit(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBasePath}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          contactEmail: editEmail || null,
          contactPhone: editPhone || null,
          ...(relationOptions ? { speProviderId: editProviderId || null } : {}),
          ...(hasTrustedFlag ? { isTrusted: editTrusted } : {}),
          actingUserId: currentUserId,
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
      setEditingId(null);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : terr('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  async function deleteEntity(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBasePath}/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actingUserId: currentUserId }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : terr('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  async function submitNew() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiBasePath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          contactEmail: newEmail || null,
          contactPhone: newPhone || null,
          ...(relationOptions ? { speProviderId: newProviderId || null } : {}),
          ...(hasTrustedFlag ? { isTrusted: newTrusted } : {}),
          actingUserId: currentUserId,
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      setNewProviderId('');
      setNewTrusted(false);
      setShowAddForm(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : terr('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {entities.length === 0 && !showAddForm && (
        <p className="text-sm text-gray-500">{t('empty')}</p>
      )}

      <div className="space-y-2">
        {entities.map((entity) => (
          <div key={entity.id} className="rounded border border-gray-200 bg-white p-3">
            {editingId === entity.id ? (
              <div className="space-y-2">
                <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={t('name')} className={inputCls} />
                <div className="grid grid-cols-2 gap-2">
                  <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder={t('contactEmail')} className={inputCls} />
                  <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder={t('contactPhone')} className={inputCls} />
                </div>
                {relationOptions && (
                  <select value={editProviderId} onChange={(e) => setEditProviderId(e.target.value)} className={inputCls}>
                    <option value="">{t('providerLabel')}...</option>
                    {relationOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.name}</option>
                    ))}
                  </select>
                )}
                {hasTrustedFlag && (
                  <label className="flex items-center gap-2 text-xs text-gray-700">
                    <input type="checkbox" checked={editTrusted} onChange={(e) => setEditTrusted(e.target.checked)} />
                    {t('trustedCheckbox')}
                  </label>
                )}
                <div className="flex gap-2">
                  <button disabled={loading || !editName.trim()} onClick={() => saveEdit(entity.id)}
                    className="rounded px-3 py-1.5 text-xs font-semibold text-white bg-[#154273] hover:bg-[#01689b] disabled:opacity-50">
                    {t('save')}
                  </button>
                  <button disabled={loading} onClick={() => setEditingId(null)}
                    className="rounded px-3 py-1.5 text-xs border border-gray-300 hover:bg-gray-50">
                    {t('cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm">
                  <p className="font-medium text-gray-900">
                    {entity.name}
                    {hasTrustedFlag && entity.isTrusted && (
                      <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                        {t('trustedBadge')}
                      </span>
                    )}
                  </p>
                  {(entity.contactEmail || entity.contactPhone) && (
                    <p className="text-xs text-gray-500">
                      {[entity.contactEmail, entity.contactPhone].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {relationOptions && (
                    <p className="text-xs text-gray-400">{t('providerLabel')}: {entity.speProvider?.name ?? '—'}</p>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => startEdit(entity)} className="text-xs text-[#01689b] hover:underline">{t('edit')}</button>
                    <button disabled={loading} onClick={() => deleteEntity(entity.id)} className="text-xs text-red-600 hover:underline">{t('delete')}</button>
                  </div>
                )}
              </div>
            )}
            {hasSpeTypes && (
              <SpeTypeList
                speOperatorId={entity.id}
                types={entity.types ?? []}
                isAdmin={isAdmin}
                currentUserId={currentUserId}
                editable={editingId === entity.id}
              />
            )}
          </div>
        ))}
      </div>

      {isAdmin && (
        showAddForm ? (
          <div className="rounded border border-gray-200 bg-white p-3 space-y-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('name')} className={inputCls} />
            <div className="grid grid-cols-2 gap-2">
              <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={t('contactEmail')} className={inputCls} />
              <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder={t('contactPhone')} className={inputCls} />
            </div>
            {relationOptions && (
              <select value={newProviderId} onChange={(e) => setNewProviderId(e.target.value)} className={inputCls}>
                <option value="">{t('providerLabel')}...</option>
                {relationOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.name}</option>
                ))}
              </select>
            )}
            {hasTrustedFlag && (
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input type="checkbox" checked={newTrusted} onChange={(e) => setNewTrusted(e.target.checked)} />
                {t('trustedCheckbox')}
              </label>
            )}
            <div className="flex gap-2">
              <button disabled={loading || !newName.trim()} onClick={submitNew}
                className="rounded px-3 py-1.5 text-xs font-semibold text-white bg-[#154273] hover:bg-[#01689b] disabled:opacity-50">
                {loading ? t('save') : t('addNew')}
              </button>
              <button disabled={loading} onClick={() => setShowAddForm(false)}
                className="rounded px-3 py-1.5 text-xs border border-gray-300 hover:bg-gray-50">
                {t('cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddForm(true)} className="text-sm text-[#01689b] hover:underline font-medium">
            + {t('addNew')}
          </button>
        )
      )}
    </div>
  );
}
