'use client';

import { useTranslations } from 'next-intl';

import { useEffect, useState } from 'react';
import { NcpApplicationSummary } from '@/lib/ncp-client';
import { readErrorMessage } from '@/lib/utils';

type ImportResult =
  | { ok: true; ref: string; id: string }
  | { ok: false; error: string; attachments?: string[] };

type NcpQueueEntry = NcpApplicationSummary & {
  alreadyImported: { id: string; referenceNumber: string } | null;
};

export function NcpFetchForm({ locale, actingUserId }: { locale?: string; actingUserId: string }) {
  const applicationHref = (id: string) => (locale ? `/${locale}/applications/${id}` : `/applications/${id}`);
  const terr = useTranslations('errors');
  const [entries, setEntries] = useState<NcpQueueEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ImportResult>>({});

  async function fetchList() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/import/ncp-queue');
      if (!res.ok) {
        setLoadError(await readErrorMessage(res, terr('requestFailed')));
        return;
      }
      const data = await res.json();
      const fetchedEntries = data.entries as NcpQueueEntry[];
      setEntries(fetchedEntries);
      // Pre-populate results for entries the server already knows were
      // imported (e.g. on a earlier visit), so they render the same
      // "Imported" state as one just clicked in this session.
      setResults((r) => {
        const next = { ...r };
        for (const entry of fetchedEntries) {
          if (entry.alreadyImported && !next[entry.applicationId]) {
            next[entry.applicationId] = {
              ok: true,
              ref: entry.alreadyImported.referenceNumber,
              id: entry.alreadyImported.id,
            };
          }
        }
        return next;
      });
    } catch {
      setLoadError('Failed to reach the HealthData@EU NCP');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, []);

  async function importEntry(entry: NcpApplicationSummary) {
    setImportingId(entry.applicationId);
    try {
      const res = await fetch(`/api/import/ncp-applications/${entry.applicationId}?userId=${actingUserId}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setResults((r) => ({
          ...r,
          [entry.applicationId]: { ok: false, error: data.error, attachments: data.attachments },
        }));
      } else {
        setResults((r) => ({
          ...r,
          [entry.applicationId]: { ok: true, ref: data.referenceNumber, id: data.id },
        }));
      }
    } finally {
      setImportingId(null);
    }
  }

  const pendingCount = entries?.filter((e) => !results[e.applicationId]?.ok).length ?? 0;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        Queries the HealthData@EU National Contact Point (NCP) for cross-border applications queued for
        HDAB-NL by sending Member States (TEHDAS2 D6.4). Two-step fetch against the HDAB-NL test
        environment: a list of pending applications, then a per-item detail fetch on import.
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={fetchList}
          disabled={loading}
          className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50"
        >
          {loading ? 'Querying NCP...' : 'Refresh queue'}
        </button>
        {entries && <span className="text-sm text-gray-500">{pendingCount} pending</span>}
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{loadError}</div>
      )}

      {entries && pendingCount === 0 && !loadError && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
          No applications currently pending at the NCP.
        </div>
      )}

      <div className="space-y-3">
        {entries?.map((entry) => {
          const result = results[entry.applicationId];
          return (
            <div key={entry.applicationId} className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-gray-900">{entry.title}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {entry.applicationId} · v{entry.version} ·{' '}
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium">{entry.status}</span> ·{' '}
                    {entry.applicationType === 'DATA_ACCESS_APPLICATION' ? 'Data access application' : 'Data request'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Submitted {new Date(entry.dateSubmitted).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={`/api/import/ncp-applications/${entry.applicationId}/attachments/application_metadata.json?userId=${actingUserId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                  >
                    View JSON
                  </a>
                  <button
                    type="button"
                    onClick={() => importEntry(entry)}
                    disabled={importingId === entry.applicationId || result?.ok === true}
                    className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {result?.ok ? 'Imported' : importingId === entry.applicationId ? 'Importing...' : 'Import'}
                  </button>
                </div>
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
                    <>
                      <pre className="whitespace-pre-wrap break-words font-mono text-xs max-h-96 overflow-y-auto">
                        ✗ {result.error}
                      </pre>
                      {result.attachments && result.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2 border-t border-red-200 pt-2">
                          {result.attachments.map((filename) => (
                            <a
                              key={filename}
                              href={`/api/import/ncp-applications/${entry.applicationId}/attachments/${encodeURIComponent(filename)}?userId=${actingUserId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
                            >
                              Open {filename} →
                            </a>
                          ))}
                        </div>
                      )}
                    </>
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
