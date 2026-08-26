'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { readErrorMessage } from '@/lib/utils';

type OwnerType = 'DataUser' | 'DataHolder' | 'SpeOperator' | 'SpeProvider';

type Contact = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: 'PRIMARY' | null;
  ownerType: OwnerType;
  ownerName: string;
};

type Owner = { id: string; name: string };

type Props = {
  contacts: Contact[];
  owners: Record<OwnerType, Owner[]>;
  isAdmin: boolean;
  currentUserId: string;
};

const OWNER_TYPES: OwnerType[] = ['DataUser', 'DataHolder', 'SpeOperator', 'SpeProvider'];

const inputCls =
  'w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]';

type FormFields = { name: string; email: string; phone: string; role: 'PRIMARY' | ''; ownerType: OwnerType | ''; ownerId: string };
const EMPTY_FORM: FormFields = { name: '', email: '', phone: '', role: '', ownerType: '', ownerId: '' };

export function ContactsManager({ contacts, owners, isAdmin, currentUserId }: Props) {
  const router = useRouter();
  const t = useTranslations('contacts');
  const terr = useTranslations('errors');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormFields>(EMPTY_FORM);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newForm, setNewForm] = useState<FormFields>(EMPTY_FORM);

  function startEdit(contact: Contact) {
    setEditingId(contact.id);
    setEditForm({
      name: contact.name ?? '',
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      role: contact.role ?? '',
      ownerType: contact.ownerType,
      ownerId: owners[contact.ownerType].find((o) => o.name === contact.ownerName)?.id ?? '',
    });
  }

  async function saveEdit(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name || null,
          email: editForm.email || null,
          phone: editForm.phone || null,
          role: editForm.role || null,
          ownerType: editForm.ownerType || null,
          ownerId: editForm.ownerId || null,
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

  async function deleteContact(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${id}`, {
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
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerType: newForm.ownerType,
          ownerId: newForm.ownerId,
          name: newForm.name || null,
          email: newForm.email || null,
          phone: newForm.phone || null,
          role: newForm.role || null,
          actingUserId: currentUserId,
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
      setNewForm(EMPTY_FORM);
      setShowAddForm(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : terr('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  const newFormValid = (newForm.name.trim() || newForm.email.trim()) && newForm.ownerType && newForm.ownerId;

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {contacts.length === 0 && !showAddForm && <p className="text-sm text-gray-500">{t('empty')}</p>}

      <div className="space-y-2">
        {contacts.map((contact) => (
          <div key={contact.id} className="rounded border border-gray-200 bg-white p-3">
            {editingId === contact.id ? (
              <div className="space-y-2">
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder={t('name')} className={inputCls} />
                <div className="grid grid-cols-2 gap-2">
                  <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder={t('email')} className={inputCls} />
                  <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder={t('phone')} className={inputCls} />
                </div>
                <select
                  value={editForm.ownerType}
                  onChange={(e) => setEditForm({ ...editForm, ownerType: e.target.value as OwnerType, ownerId: '' })}
                  className={inputCls}
                >
                  <option value="">{t('ownerType')}...</option>
                  {OWNER_TYPES.map((ot) => (
                    <option key={ot} value={ot}>{t(`ownerType${ot}`)}</option>
                  ))}
                </select>
                {editForm.ownerType && (
                  <select value={editForm.ownerId} onChange={(e) => setEditForm({ ...editForm, ownerId: e.target.value })} className={inputCls}>
                    <option value="">{t('owner')}...</option>
                    {owners[editForm.ownerType].map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                )}
                <div className="flex gap-2">
                  <button disabled={loading || !(editForm.name.trim() || editForm.email.trim())} onClick={() => saveEdit(contact.id)}
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
                  <p className="font-medium text-gray-900">{contact.name || t('unnamed')}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className="hover:text-[#01689b] hover:underline">{contact.email}</a>
                    )}
                    {contact.email && contact.phone && <span className="mx-1.5 text-gray-300">·</span>}
                    {contact.phone && (
                      <a href={`tel:${contact.phone}`} className="hover:text-[#01689b] hover:underline">{contact.phone}</a>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{contact.ownerName}</p>
                </div>
                {isAdmin && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => startEdit(contact)} className="text-xs text-[#01689b] hover:underline">{t('edit')}</button>
                    <button disabled={loading} onClick={() => deleteContact(contact.id)} className="text-xs text-red-600 hover:underline">{t('delete')}</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {isAdmin &&
        (showAddForm ? (
          <div className="rounded border border-gray-200 bg-white p-3 space-y-2">
            <input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} placeholder={t('name')} className={inputCls} />
            <div className="grid grid-cols-2 gap-2">
              <input value={newForm.email} onChange={(e) => setNewForm({ ...newForm, email: e.target.value })} placeholder={t('email')} className={inputCls} />
              <input value={newForm.phone} onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })} placeholder={t('phone')} className={inputCls} />
            </div>
            <select
              value={newForm.ownerType}
              onChange={(e) => setNewForm({ ...newForm, ownerType: e.target.value as OwnerType, ownerId: '' })}
              className={inputCls}
            >
              <option value="">{t('ownerType')}...</option>
              {OWNER_TYPES.map((ot) => (
                <option key={ot} value={ot}>{t(`ownerType${ot}`)}</option>
              ))}
            </select>
            {newForm.ownerType && (
              <select value={newForm.ownerId} onChange={(e) => setNewForm({ ...newForm, ownerId: e.target.value })} className={inputCls}>
                <option value="">{t('owner')}...</option>
                {owners[newForm.ownerType].map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            )}
            <div className="flex gap-2">
              <button disabled={loading || !newFormValid} onClick={submitNew}
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
        ))}
    </div>
  );
}
