'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const SAMPLE_PAYLOAD = JSON.stringify(
  {
    hdeuApplicationId: 'FI-HDAB-2025-0042',
    sendingCountry: 'FI',
    sendingHdab: 'Findata',
    transmissionTimestamp: new Date().toISOString(),
    ncpTransactionId: 'NCP-TXN-20250625-001',
    applicationType: 'DATA_ACCESS_APPLICATION',
    applicantName: 'Dr. K. Virtanen',
    applicantEmail: 'k.virtanen@helsinki.fi',
    applicantOrganisation: 'University of Helsinki',
    title: 'Comparative analysis of type-2 diabetes outcomes in Finland and the Netherlands 2018-2023',
    projectDescription:
      'Cross-national cohort study comparing long-term complications and treatment pathways for type-2 diabetes patients in Finland and the Netherlands, leveraging routine primary care and hospital data from both countries.',
    purposeCategory: 'SCIENTIFIC_RESEARCH',
    legalBasis: 'EHDS Art. 53(1) – scientific research',
    requestedDatasets: [
      {
        dataHolderName: 'CBS',
        datasets: [
          {
            name: "Overleden inwoners van Nederland naar doodsoorzaak (uitgebreide lijst van 'drie-teken categorieën'), leeftijd en geslacht",
            url: 'https://acceptance.data.health.europa.eu/healthdata-central-platform/datasets/24b6a9b2-4519-4f94-8c0f-c4c85f295806?locale=nl',
          },
        ],
      },
      {
        dataHolderName: 'GP Information Network (LINH)',
        datasets: [{ name: 'Medicatievoorschriften huisartsenpraktijken (ATC A10)', url: null }],
      },
    ],
    requestedVariables:
      'Age, sex, diabetes diagnosis date (ICD-10 E11), HbA1c, BMI, medication (ATC A10), hospitalisations, complications (ICD-10 E110-E149)',
    studyPopulation: 'Adults aged 18+ with a diagnosis of type-2 diabetes registered in Dutch general practices',
    inclusionCriteria: 'Age ≥18, ICD-10 E11 diagnosis confirmed, registered ≥1 year',
    exclusionCriteria: 'Type-1 diabetes, opt-out from research use',
    dataStartDate: '2018-01-01',
    dataEndDate: '2023-12-31',
    projectStartDate: '2025-09-01',
    projectEndDate: '2027-08-31',
    dataProcessingCountry: 'NL',
  },
  null,
  2,
);

export function HdeuImportForm({ locale }: { locale?: string } = {}) {
  const router = useRouter();
  const applicationHref = (id: string) => (locale ? `/${locale}/applications/${id}` : `/applications/${id}`);
  const [mode, setMode] = useState<'paste' | 'file'>('paste');
  const [json, setJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: true; ref: string; id: string; deadline: string } | { ok: false; error: string; details?: string[] } | null>(null);

  function loadSample() {
    setJson(SAMPLE_PAYLOAD);
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
        setResult({ ok: false, error: 'Invalid JSON — please check the payload.' });
        return;
      }

      const res = await fetch('/api/import/hdeu', {
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
            {m === 'paste' ? 'Paste JSON' : 'Upload file'}
          </button>
        ))}
        <button
          onClick={loadSample}
          className="ml-auto text-sm text-blue-600 hover:underline"
        >
          Load sample payload
        </button>
      </div>

      {/* Input area */}
      {mode === 'paste' ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            NCP JSON payload
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Upload .json file</label>
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleFile}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
          />
          {json && (
            <p className="mt-1 text-xs text-gray-500">
              {json.length.toLocaleString()} characters loaded
            </p>
          )}
        </div>
      )}

      {/* Required fields reference */}
      <details className="text-sm">
        <summary className="cursor-pointer text-gray-500 hover:text-gray-800">Required payload fields</summary>
        <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 p-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="pb-1 pr-4">Field</th>
                <th className="pb-1">Description</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 space-y-1">
              {[
                ['hdeuApplicationId', 'Sending DAAMS reference (e.g. FI-HDAB-2025-0042)'],
                ['sendingCountry', 'ISO 3166-1 alpha-2 country code'],
                ['sendingHdab', 'Name of the sending HDAB'],
                ['transmissionTimestamp', 'ISO 8601 datetime (clock start for Art. 68)'],
                ['applicationType', 'DATA_ACCESS_APPLICATION or DATA_REQUEST'],
                ['applicantName / Email / Organisation', 'Researcher identity'],
                ['title', 'Project title'],
                ['projectDescription', 'Lay summary'],
                ['purposeCategory', 'Art. 53 purpose code'],
                ['legalBasis', 'Applicable EHDS legal basis'],
                ['requestedDatasets', 'Array of { dataHolderName, datasets: [{ name, url? }] } groups'],
                ['requestedVariables', 'Variable-level specification'],
                ['studyPopulation / inclusionCriteria / exclusionCriteria', 'Population definition'],
                ['dataProcessingCountry', 'ISO 3166-1 alpha-2 (must include NL)'],
              ].map(([f, d]) => (
                <tr key={f}>
                  <td className="pr-4 font-mono py-0.5 align-top">{f}</td>
                  <td className="py-0.5 text-gray-500">{d}</td>
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
              <p className="font-semibold">✓ Application imported successfully</p>
              <p className="mt-1">Reference: <strong>{result.ref}</strong></p>
              <p>Decision deadline: {new Intl.DateTimeFormat('nl-NL', { dateStyle: 'long' }).format(new Date(result.deadline))}</p>
              <a
                href={applicationHref(result.id)}
                className="mt-2 inline-block text-green-700 underline hover:text-green-900"
              >
                Open application →
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
        {loading ? 'Importing...' : 'Import application'}
      </button>
    </div>
  );
}
