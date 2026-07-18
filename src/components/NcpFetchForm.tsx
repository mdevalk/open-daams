'use client';

import { useTranslations } from 'next-intl';

import { useEffect, useState } from 'react';
import { NcpQueueEntry } from '@/lib/ncp-mock';
import { readErrorMessage } from '@/lib/utils';

type ImportResult = { ok: true; ref: string; id: string } | { ok: false; error: string };

export function NcpFetchForm({ locale }: { locale?: string } = {}) {
  const applicationHref = (id: string) => (locale ? `/${locale}/applications/${id}` : `/applications/${id}`);
  const terr = useTranslations('errors');
  const [entries, setEntries] = useState<NcpQueueEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ImportResult>>({});

  async function fetchQueue() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/import/ncp-queue');
      if (!res.ok) {
        setLoadError(await readErrorMessage(res, terr('requestFailed')));
        return;
      }
      const data = await res.json();
      setEntries(data.entries);
    } catch {
      setLoadError('Failed to reach the HealthData@EU NCP');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchQueue();
  }, []);

  async function importEntry(entry: NcpQueueEntry) {
    setImportingId(entry.hdeuApplicationId);
    try {
      const res = await fetch('/api/import/hdeu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      const data = await res.json();
      if (!res.ok) {
        setResults((r) => ({ ...r, [entry.hdeuApplicationId]: { ok: false, error: data.error } }));
      } else {
        setResults((r) => ({
          ...r,
          [entry.hdeuApplicationId]: { ok: true, ref: data.referenceNumber, id: data.id },
        }));
        setEntries((prev) => prev?.filter((e) => e.hdeuApplicationId !== entry.hdeuApplicationId) ?? prev);
      }
    } finally {
      setImportingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        Queries the HealthData@EU National Contact Point (NCP) for cross-border applications queued for
        HDAB-NL by sending Member States (TEHDAS2 D6.4). This demo uses a simulated queue — no live NCP
        connection exists.
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={fetchQueue}
          disabled={loading}
          className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50"
        >
          {loading ? 'Querying NCP...' : 'Refresh queue'}
        </button>
        {entries && <span className="text-sm text-gray-500">{entries.length} pending</span>}
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{loadError}</div>
      )}

      {entries && entries.length === 0 && !loadError && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
          No applications currently queued at the NCP.
        </div>
      )}

      <div className="space-y-3">
        {entries?.map((entry) => {
          const result = results[entry.hdeuApplicationId];
          return (
            <div key={entry.hdeuApplicationId} className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-gray-900">{entry.title}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {entry.hdeuApplicationId} · from {entry.sendingHdab} ({entry.sendingCountry}) ·{' '}
                    {entry.applicationType === 'DATA_ACCESS_APPLICATION' ? 'Data access application' : 'Data request'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Applicant: {entry.applicantName}, {entry.applicantOrganisation}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => importEntry(entry)}
                  disabled={importingId === entry.hdeuApplicationId}
                  className="shrink-0 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {importingId === entry.hdeuApplicationId ? 'Importing...' : 'Import'}
                </button>
              </div>
              {result && (
                <div
                  className={`mt-3 rounded-lg border p-2 text-sm ${
                    result.ok ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-800'
                  }`}
                >
                  {result.ok ? (
                    <>
                      ✓ Imported as <strong>{result.ref}</strong>.{' '}
                      <a href={applicationHref(result.id)} className="underline hover:text-green-900">
                        Open application →
                      </a>
                    </>
                  ) : (
                    <>✗ {result.error}</>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
