'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { User } from '@prisma/client';
import { useRouter } from 'next/navigation';

const PURPOSE_VALUES = ['PUBLIC_HEALTH', 'POLICY_MAKING', 'STATISTICS', 'EDUCATION', 'SCIENTIFIC_RESEARCH', 'CARE_IMPROVEMENT'] as const;

// TEHDAS2 D6.3 Annex 5 §8 — GDPR Art. 6(1) lawful processing grounds
const LAWFULNESS_VALUES = ['CONSENT', 'CONTRACT', 'LEGAL_OBLIGATION', 'VITAL_INTERESTS', 'PUBLIC_TASK', 'LEGITIMATE_INTERESTS'] as const;

type AppType = 'DATA_ACCESS_APPLICATION' | 'DATA_REQUEST';

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

type Applicant = User & { dataUser: { name: string } | null };

export function NewApplicationForm({
  applicants,
  dataHolders,
  currentUser,
}: {
  applicants: Applicant[];
  dataHolders: { id: string; name: string }[];
  currentUser: User;
}) {
  const router = useRouter();
  const t = useTranslations('newApplicationForm');
  const terr = useTranslations('errors');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataHolderGroups, setDataHolderGroups] = useState<
    { id: string; dataHolderId: string; datasets: { id: string; name: string; url: string }[] }[]
  >([{ id: crypto.randomUUID(), dataHolderId: '', datasets: [{ id: crypto.randomUUID(), name: '', url: '' }] }]);
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

  function addDataHolderGroup() {
    setDataHolderGroups((prev) => [
      ...prev,
      { id: crypto.randomUUID(), dataHolderId: '', datasets: [{ id: crypto.randomUUID(), name: '', url: '' }] },
    ]);
  }
  function removeDataHolderGroup(id: string) {
    setDataHolderGroups((prev) => prev.filter((g) => g.id !== id));
  }
  function updateDataHolderId(id: string, dataHolderId: string) {
    setDataHolderGroups((prev) => prev.map((g) => (g.id === id ? { ...g, dataHolderId } : g)));
  }
  function addDatasetToGroup(groupId: string) {
    setDataHolderGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, datasets: [...g.datasets, { id: crypto.randomUUID(), name: '', url: '' }] } : g,
      ),
    );
  }
  function removeDatasetFromGroup(groupId: string, datasetId: string) {
    setDataHolderGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, datasets: g.datasets.filter((d) => d.id !== datasetId) } : g)),
    );
  }
  function updateDatasetField(groupId: string, datasetId: string, field: 'name' | 'url', value: string) {
    setDataHolderGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, datasets: g.datasets.map((d) => (d.id === datasetId ? { ...d, [field]: value } : d)) }
          : g,
      ),
    );
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
      actingUserId: currentUser.id,
      type: form.get('type'),
      applicantId: currentUser.role === 'APPLICANT' ? currentUser.id : form.get('applicantId'),
      title: form.get('title'),
      projectDescription: form.get('projectDescription'),
      purposeCategory: form.get('purposeCategory'),
      requestedDatasets: dataHolderGroups
        .filter((g) => g.dataHolderId)
        .map((g) => ({
          dataHolderId: g.dataHolderId,
          datasets: g.datasets
            .filter((d) => d.name.trim())
            .map((d) => ({ name: d.name.trim(), url: d.url.trim() || null })),
        }))
        .filter((g) => g.datasets.length > 0),
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
      if (!res.ok) throw new Error(terr('requestFailed'));
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
        <h2 className="font-semibold text-gray-900 mb-4">{t('typeTitle')}</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'DATA_ACCESS_APPLICATION', label: t('typeDataAccessLabel'), desc: t('typeDataAccessDesc') },
            { value: 'DATA_REQUEST', label: t('typeDataRequestLabel'), desc: t('typeDataRequestDesc') },
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
        <h2 className="font-semibold text-gray-900 mb-4">{t('applicantTitle')}</h2>
        <div>
          <label className={labelCls}>{t('applicantLabel')} <span className="text-red-500">*</span></label>
          {currentUser.role === 'APPLICANT' ? (
            <p className="text-sm text-gray-700 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
              {currentUser.name}
            </p>
          ) : (
            <select name="applicantId" required className={inputCls}>
              <option value="">{t('selectApplicant')}</option>
              {applicants.map((u) => (
                <option key={u.id} value={u.id}>{u.name} — {u.dataUser?.name ?? '—'}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Project info */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">{t('projectInfoTitle')}</h2>
        <div>
          <label className={labelCls}>{t('projectTitleLabel')} <span className="text-red-500">*</span></label>
          <input name="title" required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t('projectDescriptionLabel')} <span className="text-red-500">*</span></label>
          <textarea name="projectDescription" rows={4} required className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('purposeLabel')} <span className="text-red-500">*</span></label>
            <select name="purposeCategory" required className={inputCls}>
              <option value="">{t('selectPurpose')}</option>
              {PURPOSE_VALUES.map((v) => <option key={v} value={v}>{t(`purposeOption.${v}`)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('legalBasisLabel')}</label>
            <input name="legalBasis" placeholder={t('legalBasisPlaceholder')} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('projectStartLabel')}</label>
            <input type="date" name="projectStartDate" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('projectEndLabel')}</label>
            <input type="date" name="projectEndDate" className={inputCls} />
          </div>
        </div>
      </div>

      {/* Data scope */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">{t('dataScopeTitle')}</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('requestedDatasetsLabel')}</label>
          <div className="space-y-3">
            {dataHolderGroups.map((group) => (
              <div key={group.id} className="rounded-lg border border-gray-200 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={group.dataHolderId}
                    onChange={(e) => updateDataHolderId(group.id, e.target.value)}
                    className={`${inputCls} flex-1`}
                  >
                    <option value="">{t('selectDataHolder')}</option>
                    {dataHolders.map((dh) => (
                      <option key={dh.id} value={dh.id}>{dh.name}</option>
                    ))}
                  </select>
                  {dataHolderGroups.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDataHolderGroup(group.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      {t('remove')}
                    </button>
                  )}
                </div>
                <div className="space-y-2 pl-2 border-l-2 border-gray-100">
                  {group.datasets.map((dataset) => (
                    <div key={dataset.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={dataset.name}
                        onChange={(e) => updateDatasetField(group.id, dataset.id, 'name', e.target.value)}
                        placeholder={t('datasetNamePlaceholder')}
                        className={`${inputCls} flex-1`}
                      />
                      <input
                        type="url"
                        value={dataset.url}
                        onChange={(e) => updateDatasetField(group.id, dataset.id, 'url', e.target.value)}
                        placeholder={t('catalogueUrlPlaceholder')}
                        className={`${inputCls} flex-1`}
                      />
                      {group.datasets.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeDatasetFromGroup(group.id, dataset.id)}
                          className="text-xs text-red-600 hover:underline flex-shrink-0"
                        >
                          {t('remove')}
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addDatasetToGroup(group.id)}
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    + {t('addDataset')}
                  </button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addDataHolderGroup} className="text-sm text-blue-600 hover:underline font-medium">
              + {t('addDataHolder')}
            </button>
          </div>
        </div>
        <div>
          <label className={labelCls}>{t('requestedVariablesLabel')}</label>
          <textarea name="requestedVariables" rows={2} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('dataPeriodStartLabel')}</label>
            <input type="date" name="dataStartDate" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('dataPeriodEndLabel')}</label>
            <input type="date" name="dataEndDate" className={inputCls} />
          </div>
        </div>
      </div>

      {/* Population */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">{t('populationTitle')}</h2>
        <div>
          <label className={labelCls}>{t('studyPopulationLabel')}</label>
          <textarea name="studyPopulation" rows={2} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('inclusionCriteriaLabel')}</label>
            <textarea name="inclusionCriteria" rows={2} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('exclusionCriteriaLabel')}</label>
            <textarea name="exclusionCriteria" rows={2} className={inputCls} />
          </div>
        </div>
      </div>

      {/* Cohort formation — data access application only (Annex 5 §6.1) */}
      {type === 'DATA_ACCESS_APPLICATION' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">{t('cohortFormationTitle')}</h2>
          <div>
            <label className={labelCls}>{t('cohortFormationMethodLabel')}</label>
            <select value={cohortFormationMethod} onChange={(e) => setCohortFormationMethod(e.target.value)} className={inputCls}>
              <option value="">{t('selectOption')}</option>
              <option value="CRITERIA">{t('cohortCriteria')}</option>
              <option value="PREVIOUS_COHORT">{t('cohortPreviousCohort')}</option>
              <option value="COMBINED">{t('cohortCombined')}</option>
              <option value="WHOLE_POPULATION">{t('cohortWholePopulation')}</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('dataSubjectsInformedLabel')}</label>
            <select value={dataSubjectsInformed} onChange={(e) => setDataSubjectsInformed(e.target.value)} className={inputCls}>
              <option value="">{t('selectOption')}</option>
              <option value="true">{t('yes')}</option>
              <option value="false">{t('no')}</option>
            </select>
          </div>
          {dataSubjectsInformed && (
            <div>
              <label className={labelCls}>{dataSubjectsInformed === 'true' ? t('howInformed') : t('whyNot')}</label>
              <textarea name="dataSubjectsInformedDetail" rows={2} className={inputCls} />
            </div>
          )}
          <div className="flex items-center gap-3">
            <input type="checkbox" id="includesControls" checked={includesControls} onChange={(e) => setIncludesControls(e.target.checked)} className="rounded" />
            <label htmlFor="includesControls" className="text-sm text-gray-700">{t('includesControlsLabel')}</label>
          </div>
          {includesControls && (
            <div>
              <label className={labelCls}>{t('describeControlGroup')}</label>
              <textarea name="controlsDescription" rows={2} className={inputCls} />
            </div>
          )}
          <div className="flex items-center gap-3">
            <input type="checkbox" id="includesRelatives" checked={includesRelatives} onChange={(e) => setIncludesRelatives(e.target.checked)} className="rounded" />
            <label htmlFor="includesRelatives" className="text-sm text-gray-700">{t('includesRelativesLabel')}</label>
          </div>
          {includesRelatives && (
            <div>
              <label className={labelCls}>{t('describeRelativesGroup')}</label>
              <textarea name="relativesDescription" rows={2} className={inputCls} />
            </div>
          )}
        </div>
      )}

      {/* Cohort/dataset size & extraction method — shared (Annex 5 §6.1 / Annex 6 §6.1) */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">{t('cohortSizeTitle')}</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('cohortSizeLabel')}</label>
            <div className="flex gap-2">
              <select value={cohortSizeIsEstimate} onChange={(e) => setCohortSizeIsEstimate(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-2 text-sm">
                <option value="true">{t('estimate')}</option>
                <option value="false">{t('exact')}</option>
              </select>
              <input type="number" name="cohortSize" min={0} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>{t('cohortSizeJustificationLabel')}</label>
            <input name="cohortSizeJustification" className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('extractionMethodLabel')}</label>
            <select value={extractionMethod} onChange={(e) => setExtractionMethod(e.target.value)} className={inputCls}>
              <option value="">{t('selectOption')}</option>
              <option value="RANDOM_SAMPLE">{t('randomSample')}</option>
              <option value="ALL_QUALIFYING">{t('allQualifying')}</option>
              <option value="OTHER_SAMPLE">{t('otherSample')}</option>
            </select>
          </div>
          {(extractionMethod === 'RANDOM_SAMPLE' || extractionMethod === 'OTHER_SAMPLE') && (
            <div>
              <label className={labelCls}>{t('sampleSizeLabel')}</label>
              <input name="sampleSize" placeholder={t('sampleSizePlaceholder')} className={inputCls} />
            </div>
          )}
        </div>
        {extractionMethod === 'OTHER_SAMPLE' && (
          <div>
            <label className={labelCls}>{t('samplingMethodLabel')}</label>
            <textarea name="samplingMethodDescription" rows={2} className={inputCls} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('extractionFrequencyLabel')}</label>
            <select value={extractionFrequency} onChange={(e) => setExtractionFrequency(e.target.value)} className={inputCls}>
              <option value="">{t('selectOption')}</option>
              <option value="ONCE">{t('once')}</option>
              <option value="MULTIPLE_TIMES">{t('multipleTimes')}</option>
            </select>
          </div>
          {extractionFrequency === 'MULTIPLE_TIMES' && (
            <div>
              <label className={labelCls}>{t('intervalLabel')}</label>
              <select value={extractionInterval} onChange={(e) => setExtractionInterval(e.target.value)} className={inputCls}>
                <option value="">{t('selectOption')}</option>
                <option value="YEARLY">{t('yearly')}</option>
                <option value="HALF_YEARLY">{t('halfYearly')}</option>
                <option value="QUARTERLY">{t('quarterly')}</option>
                <option value="OTHER">{t('other')}</option>
              </select>
            </div>
          )}
        </div>
        {extractionFrequency === 'MULTIPLE_TIMES' && extractionInterval === 'OTHER' && (
          <div>
            <label className={labelCls}>{t('specifyIntervalLabel')}</label>
            <input name="extractionIntervalOther" className={inputCls} />
          </div>
        )}
        {extractionFrequency === 'MULTIPLE_TIMES' && (
          <div>
            <label className={labelCls}>{t('extractionTimingNotesLabel')}</label>
            <textarea name="extractionTimingNotes" rows={2} className={inputCls} />
          </div>
        )}
      </div>

      {/* Tabulation plan — data request only (Annex 6 §6) */}
      {type === 'DATA_REQUEST' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
          <h2 className="font-semibold text-gray-900">{t('tabulationPlanTitle')}</h2>
          <p className="text-xs text-gray-500">{t('tabulationPlanDesc')}</p>
          <textarea name="tabulationPlan" rows={4} className={inputCls} />
        </div>
      )}

      {/* Other data to combine — data access application only (Annex 5 §7) */}
      {type === 'DATA_ACCESS_APPLICATION' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">{t('otherDataTitle')}</h2>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="otherDataToCombine" checked={otherDataToCombine} onChange={(e) => setOtherDataToCombine(e.target.checked)} className="rounded" />
            <label htmlFor="otherDataToCombine" className="text-sm text-gray-700">
              {t('otherDataCheckboxLabel')}
            </label>
          </div>
          {otherDataToCombine && (
            <div>
              <label className={labelCls}>{t('otherDataDescriptionLabel')}</label>
              <textarea name="otherDataDescription" rows={2} className={inputCls} />
            </div>
          )}
        </div>
      )}

      {/* Data processing, protection & safeguards — data access application only (Annex 5 §8) */}
      {type === 'DATA_ACCESS_APPLICATION' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">{t('safeguardsTitle')}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t('speNameLabel')}</label>
              <input name="speName" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('dataControllerLabel')}</label>
              <input name="dataController" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>{t('speTechnicalRequirementsLabel')}</label>
            <textarea name="speTechnicalRequirements" rows={2} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t('dataAccessTimingLabel')}</label>
              <select value={dataAccessTiming} onChange={(e) => setDataAccessTiming(e.target.value)} className={inputCls}>
                <option value="AS_SOON_AS_POSSIBLE">{t('asap')}</option>
                <option value="LATER">{t('later')}</option>
              </select>
            </div>
            {dataAccessTiming === 'LATER' && (
              <div>
                <label className={labelCls}>{t('whenLabel')}</label>
                <input type="date" name="dataAccessLaterDate" className={inputCls} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="transfersOutsideEuEea" checked={transfersOutsideEuEea} onChange={(e) => setTransfersOutsideEuEea(e.target.checked)} className="rounded" />
            <label htmlFor="transfersOutsideEuEea" className="text-sm text-gray-700">{t('transfersOutsideEuEeaLabel')}</label>
          </div>
          {transfersOutsideEuEea && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{t('transferCountriesLabel')}</label>
                <input name="transferCountries" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('transferLegalBasisLabel')}</label>
                <input name="transferLegalBasis" placeholder={t('transferLegalBasisPlaceholder')} className={inputCls} />
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('lawfulnessLabel')}</label>
            <div className="grid grid-cols-2 gap-2">
              {LAWFULNESS_VALUES.map((v) => (
                <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={lawfulness.includes(v)} onChange={() => toggleLawfulness(v)} className="rounded" />
                  <span className="text-gray-700">{t(`lawfulnessOption.${v}`)}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Opt-out exception — shared (Annex 5 §8 / Annex 6 §6, EHDS Art. 71(4)) */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">{t('optOutTitle')}</h2>
        <div className="flex items-center gap-3">
          <input type="checkbox" id="usesOptOutException" checked={usesOptOutException} onChange={(e) => setUsesOptOutException(e.target.checked)} className="rounded" />
          <label htmlFor="usesOptOutException" className="text-sm text-gray-700">
            {t('optOutCheckboxLabel')}
          </label>
        </div>
        {usesOptOutException && (
          <div>
            <label className={labelCls}>{t('optOutJustificationLabel')}</label>
            <textarea name="optOutExceptionJustification" rows={2} className={inputCls} />
          </div>
        )}
      </div>

      {/* Decision timeline — Art. 68 */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">{t('decisionTimelineTitle')}</h2>
        <div>
          <label className={labelCls}>{t('decisionTrackLabel')}</label>
          <select value={decisionTrack} onChange={(e) => setDecisionTrack(e.target.value)} className={inputCls}>
            <option value="STANDARD">{t('standardTrack')}</option>
            <option value="EXPEDITED">{t('expeditedTrack')}</option>
          </select>
        </div>
      </div>

      {/* Cross-border */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-900 mb-3">{t('crossBorderTitle')}</h2>
        <div className="flex items-center gap-3">
          <input type="checkbox" name="isCrossBorder" id="isCrossBorder" className="rounded" />
          <label htmlFor="isCrossBorder" className="text-sm text-gray-700">
            {t('isCrossBorderLabel')}
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
          {saving ? t('creating') : t('createButton')}
        </button>
        <a href="/applications" className="rounded-lg border border-gray-300 px-6 py-2 text-sm hover:bg-gray-100">
          {t('cancel')}
        </a>
      </div>
    </form>
  );
}
