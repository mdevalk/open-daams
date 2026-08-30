'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Attachment, StudyCohort } from '@prisma/client';
import {
  cohortFormationLabel,
  extractionFrequencyLabel,
  extractionMethodLabel,
  formatDate,
  yesNoLabel,
  populationLabel,
  dataPeriodLabel,
  extractionIntervalDisplay,
  informationProviderLabel,
  hasBaseSectionData,
} from '@/lib/utils';

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

function PriorPermitDetails({ row }: { row: StudyCohort }) {
  return (
    <>
      {[row.priorPermitIssuer, row.priorPermitNumber].filter(Boolean).join(' — ')}
      {row.priorPermitDate && (
        <span className="text-gray-500 font-normal">
          {' '}
          ({formatDate(row.priorPermitDate)}
          {row.priorPermitValidFrom
            ? `, ${formatDate(row.priorPermitValidFrom)} – ${formatDate(row.priorPermitValidTo)}`
            : ''}
          )
        </span>
      )}
    </>
  );
}

// Shared by 6.1 (cohort), 6.2 (controls) and 6.3 (relatives) — the real form
// gives all three roles nearly the same question set; `extra` renders the
// handful of role-specific fields (see StudyCohortExplorer below).
function GroupFields({
  row,
  t,
  attachmentByNcpId,
  extra,
}: {
  row: StudyCohort;
  t: ReturnType<typeof useTranslations>;
  attachmentByNcpId: Map<string, Attachment>;
  extra?: React.ReactNode;
}) {
  const variablesAttachment = row.variablesAttachmentId ? attachmentByNcpId.get(row.variablesAttachmentId) : undefined;
  return (
    <>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <Field label={t('cohortFormation')} value={cohortFormationLabel(row.cohortFormationMethod ?? undefined)} />
        <Field label={t('population')} value={populationLabel(row, t)} />
        <Field label={t('sizeJustification')} value={row.sizeJustification} />
        <Field label={t('dataPeriod')} value={dataPeriodLabel(row)} />
        <Field label={t('extractionMethod')} value={extractionMethodLabel(row.extractionMethod ?? undefined)} />
        <Field label={t('inclusion')} value={row.inclusionCriteria} />
        <Field label={t('exclusion')} value={row.exclusionCriteria} />
        <Field label={t('extractionFrequency')} value={extractionFrequencyLabel(row.extractionFrequency ?? undefined)} />
        <Field label={t('extractionInterval')} value={extractionIntervalDisplay(row)} />
        <Field label={t('orderForExtraction')} value={row.orderForExtraction} />
        <Field label={t('willDataBeExtractedSimultaneously')} value={yesNoLabel(row.willDataBeExtractedSimultaneously, t)} />
        <Field label={t('sameAsCohortData')} value={yesNoLabel(row.sameAsCohortData, t)} />
        <Field label={t('dataHolders')} value={row.dataHolderIds.join(', ')} />
        <Field label={t('databases')} value={row.databaseIds.join(', ')} />
        <Field label={t('datasets')} value={row.datasetIds.join(', ')} />
        {row.formedFromPriorPermit && <Field label={t('priorPermit')} value={<PriorPermitDetails row={row} />} />}
        {extra}
      </dl>
      {row.variablesAttachmentRef && variablesAttachment && (
        <a
          href={`/api/attachments/${variablesAttachment.id}`}
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

function BaseTabPanel({
  country,
  cohort,
  t,
}: {
  country: string;
  cohort: StudyCohort | undefined;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-gray-900">{t('section6BaseHeading', { country })}</p>
      {cohort && hasBaseSectionData(cohort) ? (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label={t('hdabContacts')} value={cohort.hdabContacts} />
          <Field label={t('dataLinkingMethod')} value={cohort.howWillDataBeLinked} />
          <Field label={t('dataSubjectsInformed')} value={yesNoLabel(cohort.dataSubjectsInformed, t)} />
          <Field label={t('dataSubjectsInformedDetail')} value={cohort.dataSubjectsInformedDetail} />
          <Field
            label={t('cohortFormedFromParticipantInformation')}
            value={yesNoLabel(cohort.hasTheStudyCohortBeenFormedBasedOnInformationOfStudyParticipants, t)}
          />
          <Field
            label={t('consentCoversRegistryExtractions')}
            value={yesNoLabel(cohort.doesTheInformedConsentCoverTheRequestedRegistryExtractions, t)}
          />
          <Field
            label={t('dataPermitGrantedForResearchProject')}
            value={yesNoLabel(cohort.confirmThatDataPermitHasBeenGrantedForTheResearchProject, t)}
          />
          <Field label={t('howTheStudyCohortWasObtained')} value={cohort.howTheStudyCohortWasObtained} />
          <Field label={t('detailsOfHowTheStudyCohortHasBeenFormed')} value={cohort.detailsOfHowTheStudyCohortHasBeenFormed} />
          <Field label={t('whyNeedDataOfaWholePopulation')} value={cohort.whyNeedDataOfaWholePopulation} />
          <Field label={t('regionsSeekForData')} value={cohort.regionsSeekForData} />
          <Field label={t('informationProvider')} value={informationProviderLabel(cohort, t)} />
        </dl>
      ) : (
        <p className="text-sm text-gray-500">{t('noDataCaptured')}</p>
      )}
    </div>
  );
}

function CohortTabPanel({
  country,
  cohort,
  t,
  attachmentByNcpId,
}: {
  country: string;
  cohort: StudyCohort | undefined;
  t: ReturnType<typeof useTranslations>;
  attachmentByNcpId: Map<string, Attachment>;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-gray-900">{t('section61Heading', { country })}</p>
      {cohort ? (
        <GroupFields row={cohort} t={t} attachmentByNcpId={attachmentByNcpId} />
      ) : (
        <p className="text-sm text-gray-500">{t('noDataCaptured')}</p>
      )}
    </div>
  );
}

function ControlTabPanel({
  country,
  control,
  includesControls,
  t,
  attachmentByNcpId,
}: {
  country: string;
  control: StudyCohort | undefined;
  includesControls: boolean;
  t: ReturnType<typeof useTranslations>;
  attachmentByNcpId: Map<string, Attachment>;
}) {
  return (
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
            attachmentByNcpId={attachmentByNcpId}
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
  );
}

function RelativeTabPanel({
  country,
  relative,
  includesRelatives,
  t,
  attachmentByNcpId,
}: {
  country: string;
  relative: StudyCohort | undefined;
  includesRelatives: boolean;
  t: ReturnType<typeof useTranslations>;
  attachmentByNcpId: Map<string, Attachment>;
}) {
  return (
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
            attachmentByNcpId={attachmentByNcpId}
            extra={<Field label={t('relationshipToSubject')} value={relative.relationshipToSubject} />}
          />
        ) : (
          <p className="text-sm text-gray-500">{t('noDataCaptured')}</p>
        ))}
    </div>
  );
}

export function StudyCohortExplorer({
  studyCohorts,
  includesControls,
  includesRelatives,
  attachments,
}: {
  studyCohorts: StudyCohort[];
  includesControls: boolean;
  includesRelatives: boolean;
  attachments: Attachment[];
}) {
  const t = useTranslations('applicationDetail');
  const attachmentByNcpId = new Map(attachments.filter((a) => a.description).map((a) => [a.description as string, a]));
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
        {tab === 'base' && <BaseTabPanel country={country} cohort={cohort} t={t} />}
        {tab === '6.1' && <CohortTabPanel country={country} cohort={cohort} t={t} attachmentByNcpId={attachmentByNcpId} />}
        {tab === '6.2' && (
          <ControlTabPanel country={country} control={control} includesControls={includesControls} t={t} attachmentByNcpId={attachmentByNcpId} />
        )}
        {tab === '6.3' && (
          <RelativeTabPanel country={country} relative={relative} includesRelatives={includesRelatives} t={t} attachmentByNcpId={attachmentByNcpId} />
        )}
      </div>
    </div>
  );
}
