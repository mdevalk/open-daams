'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import pocDemoPayload from '@/lib/poc-demo-hdeu-payload.json';

// Real NCP application 6a70b4d104db074a00fd905d (HDAB-2026-0008), mapped
// through mapNcpDetailZipToHdeuPayload — title is overridden so it reads as
// a demo, not a duplicate of a real case; hdeuApplicationId gets a fresh
// UUID on every load so repeated demo runs never collide on the dedup check.
function buildSamplePayload(): string {
  return JSON.stringify(
    {
      ...pocDemoPayload,
      hdeuApplicationId: crypto.randomUUID(),
      title: 'Test Data Access Application for PoC demo',
      transmissionTimestamp: new Date().toISOString(),
    },
    null,
    2,
  );
}

export function HdeuImportForm({ locale, actingUserId }: { locale?: string; actingUserId: string }) {
  const t = useTranslations('hdeuImportForm');
  const router = useRouter();
  const applicationHref = (id: string) => (locale ? `/${locale}/applications/${id}` : `/applications/${id}`);
  const [mode, setMode] = useState<'paste' | 'file'>('paste');
  const [json, setJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: true; ref: string; id: string; deadline: string } | { ok: false; error: string; details?: string[] } | null>(null);

  function loadSample() {
    setJson(buildSamplePayload());
    setResult(null);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setJson(text);
    setResult(null);
  }

  async function submit() {
    setLoading(true);
    setResult(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        setResult({ ok: false, error: t('invalidJson') });
        return;
      }

      const res = await fetch(`/api/import/hdeu?userId=${actingUserId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });

      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, error: data.error, details: data.details });
      } else {
        setResult({
          ok: true,
          ref: data.referenceNumber,
          id: data.id,
          deadline: data.decisionDeadline,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="flex gap-2">
        {(['paste', 'file'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium border ${
              mode === m
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {m === 'paste' ? t('modePaste') : t('modeFile')}
          </button>
        ))}
        <button
          onClick={loadSample}
          className="ml-auto text-sm text-blue-600 hover:underline"
        >
          {t('loadSample')}
        </button>
      </div>

      {/* Input area */}
      {mode === 'paste' ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('jsonLabel')}
          </label>
          <textarea
            rows={16}
            value={json}
            onChange={(e) => { setJson(e.target.value); setResult(null); }}
            placeholder='{ "hdeuApplicationId": "...", ... }'
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('uploadLabel')}</label>
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleFile}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
          />
          {json && (
            <p className="mt-1 text-xs text-gray-500">
              {t('charactersLoaded', { count: json.length })}
            </p>
          )}
        </div>
      )}

      {/* Required fields reference — field names are literal API/schema
          identifiers, kept in English regardless of locale; only the
          descriptions are translated. */}
      <details className="text-sm">
        <summary className="cursor-pointer text-gray-500 hover:text-gray-800">{t('requiredFields')}</summary>
        <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 p-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="pb-1 pr-4">{t('fieldHeader')}</th>
                <th className="pb-1">{t('descriptionHeader')}</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 space-y-1">
              {([
                ['hdeuApplicationId', 'fieldHdeuApplicationId'],
                ['sendingCountry', 'fieldSendingCountry'],
                ['sendingHdab', 'fieldSendingHdab'],
                ['transmissionTimestamp', 'fieldTransmissionTimestamp'],
                ['applicationType', 'fieldApplicationType'],
                ['applicantName / Email / Organisation', 'fieldApplicantIdentity'],
                ['title', 'fieldTitle'],
                ['projectDescription', 'fieldProjectDescription'],
                ['purposeCategory', 'fieldPurposeCategory'],
                ['legalBasis', 'fieldLegalBasis'],
                ['requestedDatasets', 'fieldRequestedDatasets'],
                ['requestedVariables', 'fieldRequestedVariables'],
                ['studyPopulation / inclusionCriteria / exclusionCriteria', 'fieldStudyPopulation'],
                ['dataProcessingCountry', 'fieldDataProcessingCountry'],
              ] as const).map(([f, descKey]) => (
                <tr key={f}>
                  <td className="pr-4 font-mono py-0.5 align-top">{f}</td>
                  <td className="py-0.5 text-gray-500">{t(descKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* Result */}
      {result && (
        <div className={`rounded-lg border p-4 text-sm ${
          result.ok ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-800'
        }`}>
          {result.ok ? (
            <>
              <p className="font-semibold">✓ {t('importSuccess')}</p>
              <p className="mt-1">{t('referenceLabel')} <strong>{result.ref}</strong></p>
              <p>{t('deadlineLabel')} {new Intl.DateTimeFormat('nl-NL', { dateStyle: 'long' }).format(new Date(result.deadline))}</p>
              <a
                href={applicationHref(result.id)}
                className="mt-2 inline-block text-green-700 underline hover:text-green-900"
              >
                {t('openApplication')} →
              </a>
            </>
          ) : (
            <>
              <p className="font-semibold">✗ {result.error}</p>
              {result.details && (
                <ul className="mt-1 list-disc list-inside space-y-0.5">
                  {result.details.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <button
        disabled={loading || !json.trim()}
        onClick={submit}
        className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? t('importing') : t('importButton')}
      </button>
    </div>
  );
}
