'use client';

import { useState } from 'react';
import { AuthorizedPerson } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { readErrorMessage } from '@/lib/utils';

type Props = {
  permitId: string;
  persons: AuthorizedPerson[];
  canManage: boolean;
};

export function AuthorizedPersonsPanel({ permitId, persons, canManage }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [email, setEmail] = useState('');

  async function addPerson() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/permits/${permitId}/authorized-persons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, affiliation, email }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, 'Toevoegen mislukt'));
      setName('');
      setAffiliation('');
      setEmail('');
      setShowForm(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Onbekende fout');
    } finally {
      setLoading(false);
    }
  }

  async function removePerson(personId: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/permits/${permitId}/authorized-persons/${personId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readErrorMessage(res, 'Verwijderen mislukt'));
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Onbekende fout');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 text-sm">Gemachtigde personen (Annex 9 §6.8)</h2>
        {canManage && !showForm && (
          <button onClick={() => setShowForm(true)} className="text-xs text-[#01689b] hover:underline">
            + Toevoegen
          </button>
        )}
      </div>

      {persons.length === 0 && !showForm && (
        <p className="text-xs text-gray-500">Nog geen personen gemachtigd tot verwerking in de SPE.</p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <ul className="space-y-2">
        {persons.map((p) => (
          <li key={p.id} className="flex items-center justify-between text-sm border border-gray-100 rounded p-2">
            <div>
              <p className="font-medium">{p.name}</p>
              <p className="text-xs text-gray-500">{p.affiliation} &middot; {p.email}</p>
            </div>
            {canManage && (
              <button disabled={loading} onClick={() => removePerson(p.id)} className="text-xs text-red-600 hover:underline">
                Verwijderen
              </button>
            )}
          </li>
        ))}
      </ul>

      {canManage && showForm && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Naam</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Affiliatie</label>
            <input type="text" value={affiliation} onChange={e => setAffiliation(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">E-mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]" />
          </div>
          <div className="flex gap-2">
            <button disabled={loading || !name.trim() || !affiliation.trim() || !email.trim()} onClick={addPerson}
              className="flex-1 rounded px-3 py-2 text-sm font-semibold text-white bg-[#154273] hover:bg-[#01689b] disabled:opacity-50 transition-colors">
              {loading ? 'Bezig...' : 'Toevoegen'}
            </button>
            <button disabled={loading} onClick={() => setShowForm(false)} className="rounded px-3 py-2 text-sm border border-gray-300 hover:bg-gray-50">
              Annuleren
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
