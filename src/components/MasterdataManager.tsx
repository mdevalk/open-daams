'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { readErrorMessage, formatDate } from '@/lib/utils';
import { SpeTypeList, SpeType } from './SpeTypeList';

// The full ApplicantBillingDetails shape (minus id/applicationId/createdAt),
// shown by reference on a Data User row — not stored there, just the most
// recent one among that organisation's applications (see masterdata/page.tsx).
type ApplicantBillingDetails = {
  sameAsContactPerson: boolean | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  organisationName: string | null;
  address: string | null;
  businessId: string | null;
  vatNumber: string | null;
  invoiceType: string | null;
  invoiceReferenceNumber: string | null;
  eInvoiceAddress: string | null;
  operatorId: string | null;
  peppolCode: string | null;
  isProjectFinanciallyCovered: boolean | null;
  financingAmountRange: string | null;
  section4ProfileDataDate: string | Date | null;
};

type Contact = {
  role: 'PRIMARY' | null;
  name: string | null;
  email: string | null;
  phone: string | null;
};

type Entity = {
  id: string;
  name: string;
  contacts: Contact[];
  speProvider?: { name: string } | null;
  speProviderId?: string | null;
  isTrusted?: boolean;
  types?: SpeType[];
  address?: string | null;
  businessId?: string | null;
  vatNumber?: string | null;
  invoiceType?: string | null;
  invoiceReferenceNumber?: string | null;
  eInvoiceAddress?: string | null;
  operatorId?: string | null;
  peppolCode?: string | null;
  billingDetails?: ApplicantBillingDetails | null;
};

type Props = {
  apiBasePath: string;
  namespace: string;
  entities: Entity[];
  relationOptions?: { id: string; name: string }[];
  hasTrustedFlag?: boolean;
  hasSpeTypes?: boolean;
  hasBillingDetails?: boolean;
  hasBillingDetailsDisplay?: boolean;
  isAdmin: boolean;
  currentUserId: string;
};

type BillingFields = {
  address: string;
  businessId: string;
  vatNumber: string;
  invoiceType: string; // '' | 'PAPER' | 'ELECTRONIC'
  invoiceReferenceNumber: string;
  eInvoiceAddress: string;
  operatorId: string;
  peppolCode: string;
};

const EMPTY_BILLING: BillingFields = {
  address: '',
  businessId: '',
  vatNumber: '',
  invoiceType: '',
  invoiceReferenceNumber: '',
  eInvoiceAddress: '',
  operatorId: '',
  peppolCode: '',
};

function billingFieldsFromEntity(entity: Entity): BillingFields {
  return {
    address: entity.address ?? '',
    businessId: entity.businessId ?? '',
    vatNumber: entity.vatNumber ?? '',
    invoiceType: entity.invoiceType ?? '',
    invoiceReferenceNumber: entity.invoiceReferenceNumber ?? '',
    eInvoiceAddress: entity.eInvoiceAddress ?? '',
    operatorId: entity.operatorId ?? '',
    peppolCode: entity.peppolCode ?? '',
  };
}

function billingFieldsToPayload(billing: BillingFields) {
  return {
    address: billing.address || null,
    businessId: billing.businessId || null,
    vatNumber: billing.vatNumber || null,
    invoiceType: billing.invoiceType || null,
    invoiceReferenceNumber: billing.invoiceReferenceNumber || null,
    eInvoiceAddress: billing.eInvoiceAddress || null,
    operatorId: billing.operatorId || null,
    peppolCode: billing.peppolCode || null,
  };
}

// Full field list for the read-only, by-reference display on a Data User
// row (see ApplicantBillingDetails above) — every field that model has,
// not just the 8-field subset Data Holder/SPE Operator edit manually.
const APPLICANT_BILLING_DISPLAY_FIELDS: { key: keyof ApplicantBillingDetails; labelKey: string; type?: 'boolean' | 'date' }[] = [
  { key: 'fullName', labelKey: 'billingContactName' },
  { key: 'email', labelKey: 'billingContactEmail' },
  { key: 'phone', labelKey: 'billingContactPhone' },
  { key: 'sameAsContactPerson', labelKey: 'sameAsContactPerson', type: 'boolean' },
  { key: 'organisationName', labelKey: 'organisationName' },
  { key: 'address', labelKey: 'address' },
  { key: 'businessId', labelKey: 'businessId' },
  { key: 'vatNumber', labelKey: 'vatNumber' },
  { key: 'invoiceType', labelKey: 'invoiceType' },
  { key: 'invoiceReferenceNumber', labelKey: 'invoiceReferenceNumber' },
  { key: 'eInvoiceAddress', labelKey: 'eInvoiceAddress' },
  { key: 'operatorId', labelKey: 'operatorId' },
  { key: 'peppolCode', labelKey: 'peppolCode' },
  { key: 'isProjectFinanciallyCovered', labelKey: 'financiallyCovered', type: 'boolean' },
  { key: 'financingAmountRange', labelKey: 'financingAmountRange' },
  { key: 'section4ProfileDataDate', labelKey: 'section4ProfileDataDate', type: 'date' },
];

function hasFieldValue(value: unknown, type?: 'boolean' | 'date'): boolean {
  return type === 'boolean' ? value !== null && value !== undefined : Boolean(value);
}

function isValidDutchPhone(value: string): boolean {
  const cleaned = value.replace(/[\s-]/g, '');
  return /^(?:\+31|0031|0)[1-9]\d{8}$/.test(cleaned);
}

const inputCls =
  'w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]';

export function MasterdataManager({ apiBasePath, namespace, entities, relationOptions, hasTrustedFlag, hasSpeTypes, hasBillingDetails, hasBillingDetailsDisplay, isAdmin, currentUserId }: Props) {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useTranslations(namespace as any);
  const terr = useTranslations('errors');
  const tmd = useTranslations('masterdata');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editProviderId, setEditProviderId] = useState('');
  const [editTrusted, setEditTrusted] = useState(false);
  const [editBilling, setEditBilling] = useState<BillingFields>(EMPTY_BILLING);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newProviderId, setNewProviderId] = useState('');
  const [newTrusted, setNewTrusted] = useState(false);
  const [newBilling, setNewBilling] = useState<BillingFields>(EMPTY_BILLING);

  const editPhoneInvalid = editPhone !== '' && !isValidDutchPhone(editPhone);
  const newPhoneInvalid = newPhone !== '' && !isValidDutchPhone(newPhone);

  function startEdit(entity: Entity) {
    setEditingId(entity.id);
    setEditName(entity.name);
    setEditEmail(entity.contacts[0]?.email ?? '');
    setEditPhone(entity.contacts[0]?.phone ?? '');
    setEditProviderId(entity.speProviderId ?? '');
    setEditTrusted(entity.isTrusted ?? false);
    setEditBilling(billingFieldsFromEntity(entity));
    setError(null);
  }

  function renderBillingFields(billing: BillingFields, setBilling: (b: BillingFields) => void) {
    return (
      <div className="space-y-2 border-t border-gray-100 pt-2">
        <p className="text-xs font-semibold text-gray-700">{t('billingDetailsTitle')}</p>
        <textarea
          value={billing.address}
          onChange={(e) => setBilling({ ...billing, address: e.target.value })}
          placeholder={t('address')}
          rows={2}
          className={inputCls}
        />
        <div className="grid grid-cols-2 gap-2">
          <input value={billing.businessId} onChange={(e) => setBilling({ ...billing, businessId: e.target.value })} placeholder={t('businessId')} className={inputCls} />
          <input value={billing.vatNumber} onChange={(e) => setBilling({ ...billing, vatNumber: e.target.value })} placeholder={t('vatNumber')} className={inputCls} />
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">{t('invoiceType')}</p>
          <div className="inline-flex rounded border border-gray-300 overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setBilling({ ...billing, invoiceType: billing.invoiceType === 'PAPER' ? '' : 'PAPER' })}
              className={`px-3 py-1 ${billing.invoiceType === 'PAPER' ? 'bg-[#154273] text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              {t('invoiceTypePaper')}
            </button>
            <button
              type="button"
              onClick={() => setBilling({ ...billing, invoiceType: billing.invoiceType === 'ELECTRONIC' ? '' : 'ELECTRONIC' })}
              className={`px-3 py-1 border-l border-gray-300 ${billing.invoiceType === 'ELECTRONIC' ? 'bg-[#154273] text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              {t('invoiceTypeElectronic')}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={billing.invoiceReferenceNumber} onChange={(e) => setBilling({ ...billing, invoiceReferenceNumber: e.target.value })} placeholder={t('invoiceReferenceNumber')} className={inputCls} />
          <input value={billing.eInvoiceAddress} onChange={(e) => setBilling({ ...billing, eInvoiceAddress: e.target.value })} placeholder={t('eInvoiceAddress')} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={billing.operatorId} onChange={(e) => setBilling({ ...billing, operatorId: e.target.value })} placeholder={t('operatorId')} className={inputCls} />
          <input value={billing.peppolCode} onChange={(e) => setBilling({ ...billing, peppolCode: e.target.value })} placeholder={t('peppolCode')} className={inputCls} />
        </div>
      </div>
    );
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
          ...(hasBillingDetails ? billingFieldsToPayload(editBilling) : {}),
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
          ...(hasBillingDetails ? billingFieldsToPayload(newBilling) : {}),
          actingUserId: currentUserId,
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, terr('requestFailed')));
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      setNewProviderId('');
      setNewTrusted(false);
      setNewBilling(EMPTY_BILLING);
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
                  <div>
                    <input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder={t('contactPhone')}
                      className={`${inputCls}${editPhoneInvalid ? ' border-red-400 focus:ring-red-400' : ''}`}
                    />
                    <p className={`text-xs mt-1 ${editPhoneInvalid ? 'text-red-600' : 'text-gray-400'}`}>
                      {editPhoneInvalid ? tmd('contactPhoneInvalid') : tmd('contactPhoneHint')}
                    </p>
                  </div>
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
                {hasBillingDetails && renderBillingFields(editBilling, setEditBilling)}
                <div className="flex gap-2">
                  <button disabled={loading || !editName.trim() || editPhoneInvalid} onClick={() => saveEdit(entity.id)}
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
                  {entity.contacts.map((contact, i) => (
                    (contact.name || contact.email || contact.phone) && (
                      <p key={i} className="text-xs text-gray-500 mt-0.5">
                        {contact.name && <span className="text-gray-700 font-medium">{contact.name}</span>}
                        {contact.name && (contact.email || contact.phone) && <span className="mx-1.5 text-gray-300">·</span>}
                        {contact.email && (
                          <a href={`mailto:${contact.email}`} className="hover:text-[#01689b] hover:underline">{contact.email}</a>
                        )}
                        {contact.email && contact.phone && <span className="mx-1.5 text-gray-300">·</span>}
                        {contact.phone && (
                          <a href={`tel:${contact.phone}`} className="hover:text-[#01689b] hover:underline">{contact.phone}</a>
                        )}
                      </p>
                    )
                  ))}
                  {relationOptions && (
                    <p className="text-xs text-gray-400">{t('providerLabel')}: {entity.speProvider?.name ?? '—'}</p>
                  )}
                  {hasBillingDetailsDisplay && entity.billingDetails && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-700 mb-1">{t('billingDetailsTitle')}</p>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        {APPLICANT_BILLING_DISPLAY_FIELDS.map(({ key, labelKey, type }) => {
                          const value = entity.billingDetails![key];
                          if (!hasFieldValue(value, type)) return null;
                          const display = type === 'boolean' ? t(value ? 'yes' : 'no') : type === 'date' ? formatDate(value as string) : (value as string);
                          return (
                            <div key={key}>
                              <dt className="text-gray-400">{t(labelKey)}</dt>
                              <dd className="text-gray-700">{display}</dd>
                            </div>
                          );
                        })}
                      </dl>
                    </div>
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
              <div>
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder={t('contactPhone')}
                  className={`${inputCls}${newPhoneInvalid ? ' border-red-400 focus:ring-red-400' : ''}`}
                />
                <p className={`text-xs mt-1 ${newPhoneInvalid ? 'text-red-600' : 'text-gray-400'}`}>
                  {newPhoneInvalid ? tmd('contactPhoneInvalid') : tmd('contactPhoneHint')}
                </p>
              </div>
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
            {hasBillingDetails && renderBillingFields(newBilling, setNewBilling)}
            <div className="flex gap-2">
              <button disabled={loading || !newName.trim() || newPhoneInvalid} onClick={submitNew}
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
