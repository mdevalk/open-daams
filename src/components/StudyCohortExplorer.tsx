'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { StudyCohort } from '@prisma/client';
import { cohortFormationLabel, extractionFrequencyLabel, extractionMethodLabel, formatDate } from '@/lib/utils';

type SubTab = 'base' | '6.1' | '6.2' | '6.3';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div>
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

// Shared by 6.1 (cohort), 6.2 (controls) and 6.3 (relatives) — the real form
// gives all three roles nearly the same question set; `extra` renders the
// handful of role-specific fields (see StudyCohortExplorer below).
function GroupFields({
  row,
  t,
  hdeuApplicationId,
  extra,
}: {
  row: StudyCohort;
  t: ReturnType<typeof useTranslations>;
  hdeuApplicationId: string | null;
  extra?: React.ReactNode;
}) {
  return (
    <>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <Field label={t('cohortFormation')} value={cohortFormationLabel(row.cohortFormationMethod ?? undefined)} />
        <Field
          label={t('population')}
          value={
            row.size !== null
              ? `${row.size}${row.sizeIsEstimate !== null ? ` (${row.sizeIsEstimate ? t('estimate') : t('exact')})` : ''}`
              : undefined
          }
        />
        <Field label={t('sizeJustification')} value={row.sizeJustification} />
        <Field
          label={t('dataPeriod')}
          value={row.timePeriod || (row.dataStartDate ? `${formatDate(row.dataStartDate)} – ${formatDate(row.dataEndDate)}` : undefined)}
        />
        <Field label={t('extractionMethod')} value={extractionMethodLabel(row.extractionMethod ?? undefined)} />
        <Field label={t('inclusion')} value={row.inclusionCriteria} />
        <Field label={t('exclusion')} value={row.exclusionCriteria} />
        <Field label={t('extractionFrequency')} value={extractionFrequencyLabel(row.extractionFrequency ?? undefined)} />
        <Field label={t('orderForExtraction')} value={row.orderForExtraction} />
        {extra}
      </dl>
      {row.variablesAttachmentRef && hdeuApplicationId && (
        <a
          href={`/api/import/ncp-applications/${hdeuApplicationId}/attachments/${encodeURIComponent(row.variablesAttachmentRef)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
        >
          {row.variablesAttachmentRef}
        </a>
      )}
    </>
  );
}

export function StudyCohortExplorer({
  studyCohorts,
  includesControls,
  includesRelatives,
  hdeuApplicationId,
}: {
  studyCohorts: StudyCohort[];
  includesControls: boolean;
  includesRelatives: boolean;
  hdeuApplicationId: string | null;
}) {
  const t = useTranslations('applicationDetail');
  const countries = Array.from(new Set(studyCohorts.map((c) => c.countryId)));
  const [country, setCountry] = useState(countries[0]);
  const [tab, setTab] = useState<SubTab>('base');

  const cohort = studyCohorts.find((c) => c.countryId === country && c.role === 'COHORT');
  const control = studyCohorts.find((c) => c.countryId === country && c.role === 'CONTROL');
  const relative = studyCohorts.find((c) => c.countryId === country && c.role === 'RELATIVE');

  const tabs: { value: SubTab; label: string }[] = [
    { value: 'base', label: t('section6BaseTab') },
    { value: '6.1', label: t('section61Tab') },
    { value: '6.2', label: t('section62Tab') },
    { value: '6.3', label: t('section63Tab') },
  ];

  return (
    <div>
      {countries.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {countries.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCountry(c)}
              aria-current={country === c ? 'page' : undefined}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                country === c ? 'bg-[#154273] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-200 mb-4">
        {tabs.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-current={tab === value ? 'page' : undefined}
            className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === value
                ? 'border-[#154273] text-[#154273]'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 p-4">
        {tab === 'base' && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-900">{t('section6BaseHeading', { country })}</p>
            {cohort?.hdabContacts || cohort?.howWillDataBeLinked ? (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Field label={t('hdabContacts')} value={cohort?.hdabContacts} />
                <Field label={t('dataLinkingMethod')} value={cohort?.howWillDataBeLinked} />
              </dl>
            ) : (
              <p className="text-sm text-gray-500">{t('noDataCaptured')}</p>
            )}
          </div>
        )}

        {tab === '6.1' && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-900">{t('section61Heading', { country })}</p>
            {cohort ? (
              <GroupFields row={cohort} t={t} hdeuApplicationId={hdeuApplicationId} />
            ) : (
              <p className="text-sm text-gray-500">{t('noDataCaptured')}</p>
            )}
          </div>
        )}

        {tab === '6.2' && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-900">{t('section62Heading', { country })}</p>
            <p className="text-sm">
              <span className="text-gray-500">{t('willControlsBeExtracted')}: </span>
              <span className="font-medium">{includesControls ? t('yes') : t('no')}</span>
            </p>
            {includesControls &&
              (control ? (
                <GroupFields
                  row={control}
                  t={t}
                  hdeuApplicationId={hdeuApplicationId}
                  extra={
                    <>
                      <Field label={t('matchingCriteria')} value={control.matchingCriteria} />
                      <Field label={t('controlsPerCohortPerson')} value={control.controlsPerCohortPerson} />
                    </>
                  }
                />
              ) : (
                <p className="text-sm text-gray-500">{t('noDataCaptured')}</p>
              ))}
          </div>
        )}

        {tab === '6.3' && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-900">{t('section63Heading', { country })}</p>
            <p className="text-sm">
              <span className="text-gray-500">{t('willRelativesBeExtracted')}: </span>
              <span className="font-medium">{includesRelatives ? t('yes') : t('no')}</span>
            </p>
            {includesRelatives &&
              (relative ? (
                <GroupFields
                  row={relative}
                  t={t}
                  hdeuApplicationId={hdeuApplicationId}
                  extra={<Field label={t('relationshipToSubject')} value={relative.relationshipToSubject} />}
                />
              ) : (
                <p className="text-sm text-gray-500">{t('noDataCaptured')}</p>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
