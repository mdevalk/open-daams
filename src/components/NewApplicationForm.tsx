'use client';

import { useState } from 'react';
import { User } from '@prisma/client';
import { useRouter } from 'next/navigation';

const PURPOSE_OPTIONS = [
  { value: 'SCIENTIFIC_RESEARCH', label: 'Scientific research (Art. 34(1)(a))' },
  { value: 'PUBLIC_HEALTH', label: 'Public health (Art. 34(1)(b))' },
  { value: 'POLICY_MAKING', label: 'Policy-making & regulatory (Art. 34(1)(c))' },
  { value: 'EDUCATION_TRAINING', label: 'Education & training (Art. 34(1)(d))' },
  { value: 'HEALTHCARE_DELIVERY', label: 'Healthcare delivery (Art. 34(1)(e))' },
  { value: 'PERSONALISED_MEDICINE', label: 'Personalised medicine (Art. 34(1)(f))' },
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

export function NewApplicationForm({ applicants }: { applicants: User[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<string[]>([]);

  function toggleDataset(ds: string) {
    setDatasets((prev) => prev.includes(ds) ? prev.filter((d) => d !== ds) : [...prev, ds]);
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
      setError(e instanceof Error ? e.message : 'Unexpected error');
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
            { value: 'DATA_ACCESS_APPLICATION', label: 'Data Permit Application', desc: 'Full access to personal data in a Secure Processing Environment (Art. 46 EHDS)' },
            { value: 'DATA_REQUEST', label: 'Data Request', desc: 'Anonymised / aggregated statistical results only (Art. 69 EHDS)' },
          ].map((opt) => (
            <label key={opt.value} className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 cursor-pointer has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
              <input type="radio" name="type" value={opt.value} required className="mt-0.5" />
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Applicant <span className="text-red-500">*</span></label>
          <select name="applicantId" required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Project title <span className="text-red-500">*</span></label>
          <input name="title" required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Project description <span className="text-red-500">*</span></label>
          <textarea name="projectDescription" rows={4} required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Purpose (Art. 34) <span className="text-red-500">*</span></label>
            <select name="purposeCategory" required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select purpose...</option>
              {PURPOSE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Legal basis</label>
            <input name="legalBasis" placeholder="e.g. EHDS Art. 34(1)(a)" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project start</label>
            <input type="date" name="projectStartDate" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project end</label>
            <input type="date" name="projectEndDate" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Requested variables</label>
          <textarea name="requestedVariables" rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data period start</label>
            <input type="date" name="dataStartDate" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data period end</label>
            <input type="date" name="dataEndDate" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </div>

      {/* Population */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Study population</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Study population</label>
          <textarea name="studyPopulation" rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Inclusion criteria</label>
            <textarea name="inclusionCriteria" rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Exclusion criteria</label>
            <textarea name="exclusionCriteria" rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </div>

      {/* Cross-border */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Cross-border & processing</h2>
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
