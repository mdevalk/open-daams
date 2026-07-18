'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { User } from '@prisma/client';
import { useRouter } from 'next/navigation';

const PURPOSE_OPTIONS = [
  { value: 'PUBLIC_HEALTH', label: 'Public health' },
  { value: 'POLICY_MAKING', label: 'Policy-making & regulatory' },
  { value: 'STATISTICS', label: 'Statistics' },
  { value: 'EDUCATION', label: 'Education & training' },
  { value: 'SCIENTIFIC_RESEARCH', label: 'Scientific research' },
  { value: 'CARE_IMPROVEMENT', label: 'Care improvement' },
];

const DATASET_OPTIONS = [
  'GP_ELECTRONIC_RECORDS',
  'HOSPITAL_DISCHARGE_RECORDS',
  'MEDICATION_DISPENSING',
  'NATIONAL_IMMUNISATION_REGISTER',
  'MENTAL_HEALTH_CLAIMS',
  'CANCER_REGISTRY',
  'VITAL_STATISTICS',
  'POPULATION_REGISTRY',
];

// TEHDAS2 D6.3 Annex 5 §8 — GDPR Art. 6(1) lawful processing grounds
const LAWFULNESS_OPTIONS = [
  { value: 'CONSENT', label: 'Consent of the data subject' },
  { value: 'CONTRACT', label: 'Performance of a contract' },
  { value: 'LEGAL_OBLIGATION', label: 'Compliance with a legal obligation' },
  { value: 'VITAL_INTERESTS', label: 'Protection of vital interests' },
  { value: 'PUBLIC_TASK', label: 'Performance of a task in the public interest' },
  { value: 'LEGITIMATE_INTERESTS', label: 'Legitimate interests' },
];

type AppType = 'DATA_ACCESS_APPLICATION' | 'DATA_REQUEST';

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

export function NewApplicationForm({ applicants }: { applicants: User[] }) {
  const router = useRouter();
  const terr = useTranslations('errors');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<string[]>([]);
  const [type, setType] = useState<AppType | ''>('');

  const [cohortFormationMethod, setCohortFormationMethod] = useState('');
  const [cohortSizeIsEstimate, setCohortSizeIsEstimate] = useState('true');
  const [dataSubjectsInformed, setDataSubjectsInformed] = useState('');
  const [includesControls, setIncludesControls] = useState(false);
  const [includesRelatives, setIncludesRelatives] = useState(false);
  const [otherDataToCombine, setOtherDataToCombine] = useState(false);
  const [dataAccessTiming, setDataAccessTiming] = useState('AS_SOON_AS_POSSIBLE');
  const [transfersOutsideEuEea, setTransfersOutsideEuEea] = useState(false);
  const [lawfulness, setLawfulness] = useState<string[]>([]);
  const [extractionMethod, setExtractionMethod] = useState('');
  const [extractionFrequency, setExtractionFrequency] = useState('');
  const [extractionInterval, setExtractionInterval] = useState('');
  const [usesOptOutException, setUsesOptOutException] = useState(false);
  const [decisionTrack, setDecisionTrack] = useState('STANDARD');

  function toggleDataset(ds: string) {
    setDatasets((prev) => prev.includes(ds) ? prev.filter((d) => d !== ds) : [...prev, ds]);
  }

  function toggleLawfulness(code: string) {
    setLawfulness((prev) => prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(e.currentTarget);

    const body = {
      type: form.get('type'),
      applicantId: form.get('applicantId'),
      title: form.get('title'),
      projectDescription: form.get('projectDescription'),
      purposeCategory: form.get('purposeCategory'),
      requestedDatasets: datasets,
      requestedVariables: form.get('requestedVariables'),
      studyPopulation: form.get('studyPopulation'),
      inclusionCriteria: form.get('inclusionCriteria'),
      exclusionCriteria: form.get('exclusionCriteria'),
      dataStartDate: form.get('dataStartDate') || null,
      dataEndDate: form.get('dataEndDate') || null,
      projectStartDate: form.get('projectStartDate') || null,
      projectEndDate: form.get('projectEndDate') || null,
      legalBasis: form.get('legalBasis'),
      dataProcessingCountry: form.get('dataProcessingCountry') || 'NL',
      isCrossBorder: form.get('isCrossBorder') === 'on',
      decisionTrack,

      // Shared cohort/extraction fields (Annex 5 §6.1 / Annex 6 §6.1)
      cohortSizeIsEstimate: cohortSizeIsEstimate === 'true',
      cohortSize: form.get('cohortSize') || null,
      cohortSizeJustification: form.get('cohortSizeJustification'),
      extractionMethod: extractionMethod || null,
      sampleSize: form.get('sampleSize'),
      samplingMethodDescription: form.get('samplingMethodDescription'),
      extractionFrequency: extractionFrequency || null,
      extractionInterval: extractionFrequency === 'MULTIPLE_TIMES' ? (extractionInterval || null) : null,
      extractionIntervalOther: form.get('extractionIntervalOther'),
      extractionTimingNotes: form.get('extractionTimingNotes'),

      // Opt-out exception (Annex 5 §8 / Annex 6 §6, EHDS Art. 71(4))
      usesOptOutException,
      optOutExceptionJustification: form.get('optOutExceptionJustification'),

      // Data access application only (Annex 5 §6.1–6.3, 7, 8)
      ...(type === 'DATA_ACCESS_APPLICATION' ? {
        cohortFormationMethod: cohortFormationMethod || null,
        dataSubjectsInformed: dataSubjectsInformed ? dataSubjectsInformed === 'true' : null,
        dataSubjectsInformedDetail: form.get('dataSubjectsInformedDetail'),
        includesControls,
        controlsDescription: includesControls ? form.get('controlsDescription') : null,
        includesRelatives,
        relativesDescription: includesRelatives ? form.get('relativesDescription') : null,
        otherDataToCombine,
        otherDataDescription: otherDataToCombine ? form.get('otherDataDescription') : null,
        speName: form.get('speName'),
        speTechnicalRequirements: form.get('speTechnicalRequirements'),
        dataAccessTiming,
        dataAccessLaterDate: dataAccessTiming === 'LATER' ? (form.get('dataAccessLaterDate') || null) : null,
        transfersOutsideEuEea,
        transferCountries: transfersOutsideEuEea
          ? String(form.get('transferCountries') || '').split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        transferLegalBasis: transfersOutsideEuEea ? form.get('transferLegalBasis') : null,
        dataController: form.get('dataController'),
        lawfulnessOfProcessing: lawfulness,
      } : {}),

      // Data request only (Annex 6 §6)
      ...(type === 'DATA_REQUEST' ? {
        tabulationPlan: form.get('tabulationPlan'),
      } : {}),
    };

    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to create application');
      const data = await res.json();
      router.push(`/applications/${data.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : terr('unexpected'));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Application type */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Application type</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'DATA_ACCESS_APPLICATION', label: 'Data Permit Application', desc: 'Full access to personal data in a Secure Processing Environment (Art. 67 EHDS)' },
            { value: 'DATA_REQUEST', label: 'Data Request', desc: 'Anonymised / aggregated statistical results only (Art. 69 EHDS)' },
          ].map((opt) => (
            <label key={opt.value} className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 cursor-pointer has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
              <input
                type="radio"
                name="type"
                value={opt.value}
                required
                checked={type === opt.value}
                onChange={() => setType(opt.value as AppType)}
                className="mt-0.5"
              />
              <div>
                <p className="font-medium text-sm">{opt.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Applicant */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Applicant</h2>
        <div>
          <label className={labelCls}>Applicant <span className="text-red-500">*</span></label>
          <select name="applicantId" required className={inputCls}>
            <option value="">Select applicant...</option>
            {applicants.map((u) => (
              <option key={u.id} value={u.id}>{u.name} — {u.organisation}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Project info */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Project information</h2>
        <div>
          <label className={labelCls}>Project title <span className="text-red-500">*</span></label>
          <input name="title" required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Project description <span className="text-red-500">*</span></label>
          <textarea name="projectDescription" rows={4} required className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Purpose (Art. 53) <span className="text-red-500">*</span></label>
            <select name="purposeCategory" required className={inputCls}>
              <option value="">Select purpose...</option>
              {PURPOSE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Legal basis</label>
            <input name="legalBasis" placeholder="e.g. EHDS Art. 53(1)" className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Project start</label>
            <input type="date" name="projectStartDate" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Project end</label>
            <input type="date" name="projectEndDate" className={inputCls} />
          </div>
        </div>
      </div>

      {/* Data scope */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Data scope</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Requested datasets</label>
          <div className="grid grid-cols-2 gap-2">
            {DATASET_OPTIONS.map((ds) => (
              <label key={ds} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={datasets.includes(ds)} onChange={() => toggleDataset(ds)} className="rounded" />
                <span className="text-gray-700">{ds.replace(/_/g, ' ')}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className={labelCls}>Requested variables</label>
          <textarea name="requestedVariables" rows={2} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Data period start</label>
            <input type="date" name="dataStartDate" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Data period end</label>
            <input type="date" name="dataEndDate" className={inputCls} />
          </div>
        </div>
      </div>

      {/* Population */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Study population</h2>
        <div>
          <label className={labelCls}>Study population</label>
          <textarea name="studyPopulation" rows={2} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Inclusion criteria</label>
            <textarea name="inclusionCriteria" rows={2} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Exclusion criteria</label>
            <textarea name="exclusionCriteria" rows={2} className={inputCls} />
          </div>
        </div>
      </div>

      {/* Cohort formation — data access application only (Annex 5 §6.1) */}
      {type === 'DATA_ACCESS_APPLICATION' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Cohort formation (Annex 5 §6.1)</h2>
          <div>
            <label className={labelCls}>How is the cohort formed?</label>
            <select value={cohortFormationMethod} onChange={(e) => setCohortFormationMethod(e.target.value)} className={inputCls}>
              <option value="">Select...</option>
              <option value="CRITERIA">Formed based on the criteria given in this application</option>
              <option value="PREVIOUS_COHORT">An already-established cohort</option>
              <option value="COMBINED">Combination of criteria and a previously established cohort</option>
              <option value="WHOLE_POPULATION">The whole population of the indicated country/countries</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Have data subjects been informed of the data use?</label>
            <select value={dataSubjectsInformed} onChange={(e) => setDataSubjectsInformed(e.target.value)} className={inputCls}>
              <option value="">Select...</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
          {dataSubjectsInformed && (
            <div>
              <label className={labelCls}>{dataSubjectsInformed === 'true' ? 'How were they informed?' : 'Why not?'}</label>
              <textarea name="dataSubjectsInformedDetail" rows={2} className={inputCls} />
            </div>
          )}
          <div className="flex items-center gap-3">
            <input type="checkbox" id="includesControls" checked={includesControls} onChange={(e) => setIncludesControls(e.target.checked)} className="rounded" />
            <label htmlFor="includesControls" className="text-sm text-gray-700">Controls will be extracted for the cohort (Annex 5 §6.2)</label>
          </div>
          {includesControls && (
            <div>
              <label className={labelCls}>Describe the control group (matching criteria, size, extraction timing)</label>
              <textarea name="controlsDescription" rows={2} className={inputCls} />
            </div>
          )}
          <div className="flex items-center gap-3">
            <input type="checkbox" id="includesRelatives" checked={includesRelatives} onChange={(e) => setIncludesRelatives(e.target.checked)} className="rounded" />
            <label htmlFor="includesRelatives" className="text-sm text-gray-700">Relatives will be extracted for the cohort (Annex 5 §6.3)</label>
          </div>
          {includesRelatives && (
            <div>
              <label className={labelCls}>Describe the relatives group (relationship, size, extraction timing)</label>
              <textarea name="relativesDescription" rows={2} className={inputCls} />
            </div>
          )}
        </div>
      )}

      {/* Cohort/dataset size & extraction method — shared (Annex 5 §6.1 / Annex 6 §6.1) */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Cohort size &amp; extraction method</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Cohort size</label>
            <div className="flex gap-2">
              <select value={cohortSizeIsEstimate} onChange={(e) => setCohortSizeIsEstimate(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-2 text-sm">
                <option value="true">Estimate</option>
                <option value="false">Exact</option>
              </select>
              <input type="number" name="cohortSize" min={0} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Why do you need a cohort of this size?</label>
            <input name="cohortSizeJustification" className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Extraction method</label>
            <select value={extractionMethod} onChange={(e) => setExtractionMethod(e.target.value)} className={inputCls}>
              <option value="">Select...</option>
              <option value="RANDOM_SAMPLE">Random sample</option>
              <option value="ALL_QUALIFYING">All people fulfilling the criteria</option>
              <option value="OTHER_SAMPLE">Other sample</option>
            </select>
          </div>
          {(extractionMethod === 'RANDOM_SAMPLE' || extractionMethod === 'OTHER_SAMPLE') && (
            <div>
              <label className={labelCls}>Sample size</label>
              <input name="sampleSize" placeholder="e.g. 100000 persons or 50%" className={inputCls} />
            </div>
          )}
        </div>
        {extractionMethod === 'OTHER_SAMPLE' && (
          <div>
            <label className={labelCls}>Describe the sampling method</label>
            <textarea name="samplingMethodDescription" rows={2} className={inputCls} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>How often does the data need to be extracted?</label>
            <select value={extractionFrequency} onChange={(e) => setExtractionFrequency(e.target.value)} className={inputCls}>
              <option value="">Select...</option>
              <option value="ONCE">Once</option>
              <option value="MULTIPLE_TIMES">Multiple times</option>
            </select>
          </div>
          {extractionFrequency === 'MULTIPLE_TIMES' && (
            <div>
              <label className={labelCls}>Interval</label>
              <select value={extractionInterval} onChange={(e) => setExtractionInterval(e.target.value)} className={inputCls}>
                <option value="">Select...</option>
                <option value="YEARLY">Every year</option>
                <option value="HALF_YEARLY">Half a year</option>
                <option value="QUARTERLY">Quarter</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          )}
        </div>
        {extractionFrequency === 'MULTIPLE_TIMES' && extractionInterval === 'OTHER' && (
          <div>
            <label className={labelCls}>Specify other interval</label>
            <input name="extractionIntervalOther" className={inputCls} />
          </div>
        )}
        {extractionFrequency === 'MULTIPLE_TIMES' && (
          <div>
            <label className={labelCls}>More information on the extracting periods/times</label>
            <textarea name="extractionTimingNotes" rows={2} className={inputCls} />
          </div>
        )}
      </div>

      {/* Tabulation plan — data request only (Annex 6 §6) */}
      {type === 'DATA_REQUEST' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
          <h2 className="font-semibold text-gray-900">Tabulation plan (Annex 6 §6)</h2>
          <p className="text-xs text-gray-500">
            For each table: register to be used, possible cohort, required variables, formation of derived
            variables, direction of percentage aggregation, order of table generation, and any other relevant
            factor.
          </p>
          <textarea name="tabulationPlan" rows={4} className={inputCls} />
        </div>
      )}

      {/* Other data to combine — data access application only (Annex 5 §7) */}
      {type === 'DATA_ACCESS_APPLICATION' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">Other data to be combined (Annex 5 §7)</h2>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="otherDataToCombine" checked={otherDataToCombine} onChange={(e) => setOtherDataToCombine(e.target.checked)} className="rounded" />
            <label htmlFor="otherDataToCombine" className="text-sm text-gray-700">
              This data will be combined with data already held or obtained elsewhere
            </label>
          </div>
          {otherDataToCombine && (
            <div>
              <label className={labelCls}>Describe the other data and the planned combination method</label>
              <textarea name="otherDataDescription" rows={2} className={inputCls} />
            </div>
          )}
        </div>
      )}

      {/* Data processing, protection & safeguards — data access application only (Annex 5 §8) */}
      {type === 'DATA_ACCESS_APPLICATION' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Data processing, protection &amp; safeguards (Annex 5 §8)</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Name of the secure processing environment (if known)</label>
              <input name="speName" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Data controller</label>
              <input name="dataController" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Technical requirements for the SPE</label>
            <textarea name="speTechnicalRequirements" rows={2} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>When do you need the data?</label>
              <select value={dataAccessTiming} onChange={(e) => setDataAccessTiming(e.target.value)} className={inputCls}>
                <option value="AS_SOON_AS_POSSIBLE">As soon as possible after processing</option>
                <option value="LATER">Later</option>
              </select>
            </div>
            {dataAccessTiming === 'LATER' && (
              <div>
                <label className={labelCls}>When?</label>
                <input type="date" name="dataAccessLaterDate" className={inputCls} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="transfersOutsideEuEea" checked={transfersOutsideEuEea} onChange={(e) => setTransfersOutsideEuEea(e.target.checked)} className="rounded" />
            <label htmlFor="transfersOutsideEuEea" className="text-sm text-gray-700">Data will be transferred outside the EU/EEA</label>
          </div>
          {transfersOutsideEuEea && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Country/countries (comma-separated)</label>
                <input name="transferCountries" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Legal basis for the transfer</label>
                <input name="transferLegalBasis" placeholder="e.g. adequacy decision, appropriate safeguards" className={inputCls} />
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Lawfulness of processing (GDPR Art. 6(1))</label>
            <div className="grid grid-cols-2 gap-2">
              {LAWFULNESS_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={lawfulness.includes(o.value)} onChange={() => toggleLawfulness(o.value)} className="rounded" />
                  <span className="text-gray-700">{o.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Opt-out exception — shared (Annex 5 §8 / Annex 6 §6, EHDS Art. 71(4)) */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Opt-out exception (Art. 71(4) EHDS)</h2>
        <div className="flex items-center gap-3">
          <input type="checkbox" id="usesOptOutException" checked={usesOptOutException} onChange={(e) => setUsesOptOutException(e.target.checked)} className="rounded" />
          <label htmlFor="usesOptOutException" className="text-sm text-gray-700">
            This application requests data from persons who exercised their opt-out right, via the national exception mechanism
          </label>
        </div>
        {usesOptOutException && (
          <div>
            <label className={labelCls}>Justification for using the exception</label>
            <textarea name="optOutExceptionJustification" rows={2} className={inputCls} />
          </div>
        )}
      </div>

      {/* Decision timeline — Art. 68 */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Decision timeline (Art. 68)</h2>
        <div>
          <label className={labelCls}>Applicable decision deadline</label>
          <select value={decisionTrack} onChange={(e) => setDecisionTrack(e.target.value)} className={inputCls}>
            <option value="STANDARD">Standard — 3 months, extendable by 3 (general applicants)</option>
            <option value="EXPEDITED">Accelerated — 2 months, extendable by 1 (public-sector body / EU institution under a public-health or policy mandate)</option>
          </select>
        </div>
      </div>

      {/* Cross-border */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Cross-border &amp; processing</h2>
        <div className="flex items-center gap-3">
          <input type="checkbox" name="isCrossBorder" id="isCrossBorder" className="rounded" />
          <label htmlFor="isCrossBorder" className="text-sm text-gray-700">
            This is a cross-border application (HealthData@EU NCP involvement required)
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Creating...' : 'Create application (save as draft)'}
        </button>
        <a href="/applications" className="rounded-lg border border-gray-300 px-6 py-2 text-sm hover:bg-gray-100">
          Cancel
        </a>
      </div>
    </form>
  );
}
