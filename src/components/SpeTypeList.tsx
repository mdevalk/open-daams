'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { readErrorMessage } from '@/lib/utils';

export type SpeType = { id: string; name: string; setupFee: unknown; monthlyFee: unknown };

type Props = {
  speOperatorId: string;
  types: SpeType[];
  isAdmin: boolean;
  currentUserId: string;
  // Types are only add/edit/delete-able while the parent SPE Operator card
  // itself is in edit mode — one edit session covers masterdata and types
  // together, rather than two independently-live edit surfaces in one card.
  editable: boolean;
};

const fieldCls =
  'rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#01689b]';

export function SpeTypeList({ speOperatorId, types, isAdmin, currentUserId, editable }: Props) {
  const router = useRouter();
  const t = useTranslations('speOperators');
  const terr = useTranslations('errors');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSetupFee, setEditSetupFee] = useState('');
  const [editMonthlyFee, setEditMonthlyFee] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSetupFee, setNewSetupFee] = useState('');
  const [newMonthlyFee, setNewMonthlyFee] = useState('');

  function startEdit(type: SpeType) {
    setEditingId(type.id);
    setEditName(type.name);
    setEditSetupFee(String(type.setupFee));
    setEditMonthlyFee(String(type.monthlyFee));
    setError(null);
  }

  async function saveEdit(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/spe-types/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, setupFee: editSetupFee, monthlyFee: editMonthlyFee, actingUserId: currentUserId }),
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

  async function deleteType(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/spe-types/${id}`, {
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
      const res = await fetch(`/api/spe-operators/${speOperatorId}/types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, setupFee: newSetupFee, monthlyFee: newMonthlyFee, actingUserId: currentUserId }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
      setNewName('');
      setNewSetupFee('');
      setNewMonthlyFee('');
      setShowAdd(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : terr('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  const showTable = types.length > 0 || showAdd;

  return (
    <div className="mt-2 pl-3 border-l-2 border-gray-100 space-y-1.5">
      <p className="text-xs font-medium text-gray-500">{t('typesLabel')}</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!showTable && <p className="text-xs text-gray-400">{t('typesEmpty')}</p>}

      {showTable && (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-gray-500">
              <th className="text-left font-medium py-1 pr-2">{t('typeName')}</th>
              <th className="text-right font-medium py-1 px-2">{t('setupFee')}</th>
              <th className="text-right font-medium py-1 px-2">{t('monthlyFee')}</th>
              {editable && isAdmin && <th className="py-1 pl-2" />}
            </tr>
          </thead>
          <tbody>
            {types.map((type) => (
              <tr key={type.id} className="border-t border-gray-100">
                {editable && editingId === type.id ? (
                  <>
                    <td className="py-1 pr-2">
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={t('typeName')} className={`${fieldCls} w-full`} />
                    </td>
                    <td className="py-1 px-2">
                      <input type="number" step="0.01" value={editSetupFee} onChange={(e) => setEditSetupFee(e.target.value)} placeholder={t('setupFee')} className={`${fieldCls} w-20 text-right`} />
                    </td>
                    <td className="py-1 px-2">
                      <input type="number" step="0.01" value={editMonthlyFee} onChange={(e) => setEditMonthlyFee(e.target.value)} placeholder={t('monthlyFee')} className={`${fieldCls} w-20 text-right`} />
                    </td>
                    <td className="py-1 pl-2 whitespace-nowrap">
                      <button disabled={loading || !editName.trim()} onClick={() => saveEdit(type.id)} className="text-[#01689b] hover:underline">{t('save')}</button>
                      <button disabled={loading} onClick={() => setEditingId(null)} className="ml-2 text-gray-500 hover:underline">{t('cancel')}</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-1 pr-2 text-gray-700">{type.name}</td>
                    <td className="py-1 px-2 text-right text-gray-700">€{String(type.setupFee)}</td>
                    <td className="py-1 px-2 text-right text-gray-700">€{String(type.monthlyFee)}</td>
                    {editable && isAdmin && (
                      <td className="py-1 pl-2 whitespace-nowrap">
                        <button onClick={() => startEdit(type)} className="text-[#01689b] hover:underline">{t('edit')}</button>
                        <button disabled={loading} onClick={() => deleteType(type.id)} className="ml-2 text-red-600 hover:underline">{t('delete')}</button>
                      </td>
                    )}
                  </>
                )}
              </tr>
            ))}
            {editable && isAdmin && showAdd && (
              <tr className="border-t border-gray-100">
                <td className="py-1 pr-2">
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('typeName')} className={`${fieldCls} w-full`} />
                </td>
                <td className="py-1 px-2">
                  <input type="number" step="0.01" value={newSetupFee} onChange={(e) => setNewSetupFee(e.target.value)} placeholder={t('setupFee')} className={`${fieldCls} w-20 text-right`} />
                </td>
                <td className="py-1 px-2">
                  <input type="number" step="0.01" value={newMonthlyFee} onChange={(e) => setNewMonthlyFee(e.target.value)} placeholder={t('monthlyFee')} className={`${fieldCls} w-20 text-right`} />
                </td>
                <td className="py-1 pl-2 whitespace-nowrap">
                  <button disabled={loading || !newName.trim()} onClick={submitNew} className="text-[#01689b] hover:underline">{t('addTypeSubmit')}</button>
                  <button disabled={loading} onClick={() => setShowAdd(false)} className="ml-2 text-gray-500 hover:underline">{t('cancel')}</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {editable && isAdmin && !showAdd && (
        <button onClick={() => setShowAdd(true)} className="text-xs text-[#01689b] hover:underline">+ {t('addType')}</button>
      )}
    </div>
  );
}
