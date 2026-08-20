// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { StudyCohortExplorer } from './StudyCohortExplorer';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

afterEach(cleanup);

type StudyCohorts = ComponentProps<typeof StudyCohortExplorer>['studyCohorts'];
type Attachments = ComponentProps<typeof StudyCohortExplorer>['attachments'];

function makeCohort(overrides: Partial<StudyCohorts[number]> = {}): StudyCohorts[number] {
  return {
    id: 'sc-1',
    countryId: 'NL',
    role: 'COHORT',
    cohortFormationMethod: null,
    size: null,
    sizeIsEstimate: null,
    sizeJustification: null,
    timePeriod: null,
    dataStartDate: null,
    dataEndDate: null,
    extractionMethod: null,
    inclusionCriteria: null,
    exclusionCriteria: null,
    extractionFrequency: null,
    extractionInterval: null,
    extractionIntervalOther: null,
    orderForExtraction: null,
    willDataBeExtractedSimultaneously: null,
    sameAsCohortData: null,
    dataHolderIds: [],
    databaseIds: [],
    datasetIds: [],
    formedFromPriorPermit: false,
    priorPermitIssuer: null,
    priorPermitNumber: null,
    priorPermitDate: null,
    priorPermitValidFrom: null,
    priorPermitValidTo: null,
    variablesAttachmentId: null,
    variablesAttachmentRef: null,
    hdabContacts: null,
    howWillDataBeLinked: null,
    dataSubjectsInformed: null,
    dataSubjectsInformedDetail: null,
    hasTheStudyCohortBeenFormedBasedOnInformationOfStudyParticipants: null,
    doesTheInformedConsentCoverTheRequestedRegistryExtractions: null,
    confirmThatDataPermitHasBeenGrantedForTheResearchProject: null,
    howTheStudyCohortWasObtained: null,
    detailsOfHowTheStudyCohortHasBeenFormed: null,
    whyNeedDataOfaWholePopulation: null,
    regionsSeekForData: null,
    informationProviderName: null,
    informationProviderEmail: null,
    informationProviderPhone: null,
    informationProviderSameAsContactPerson: null,
    matchingCriteria: null,
    controlsPerCohortPerson: null,
    relationshipToSubject: null,
    ...overrides,
  } as unknown as StudyCohorts[number];
}

describe('StudyCohortExplorer — country switcher', () => {
  it('shows no country buttons for a single country, and switches base heading for multiple', () => {
    const single = [makeCohort({ countryId: 'NL' })];
    const { rerender } = render(
      <StudyCohortExplorer studyCohorts={single} includesControls={false} includesRelatives={false} attachments={[] as Attachments} />,
    );
    // Only one country -> no pill buttons, but base tab (default) still shows.
    expect(screen.queryByText('NL')).not.toBeInTheDocument();

    const multi = [makeCohort({ countryId: 'NL' }), makeCohort({ id: 'sc-2', countryId: 'DE' })];
    rerender(
      <StudyCohortExplorer studyCohorts={multi} includesControls={false} includesRelatives={false} attachments={[] as Attachments} />,
    );
    expect(screen.getByText('NL')).toBeInTheDocument();
    expect(screen.getByText('DE')).toBeInTheDocument();

    fireEvent.click(screen.getByText('DE'));
    expect(screen.getByText('section6BaseHeading:{"country":"DE"}')).toBeInTheDocument();
  });
});

describe('StudyCohortExplorer — base tab', () => {
  it('shows noDataCaptured when no base fields are set', () => {
    render(
      <StudyCohortExplorer
        studyCohorts={[makeCohort()]}
        includesControls={false}
        includesRelatives={false}
        attachments={[] as Attachments}
      />,
    );
    expect(screen.getByText('noDataCaptured')).toBeInTheDocument();
  });

  it('renders base fields when present', () => {
    render(
      <StudyCohortExplorer
        studyCohorts={[makeCohort({ hdabContacts: 'Dr. Jansen', dataSubjectsInformed: true })]}
        includesControls={false}
        includesRelatives={false}
        attachments={[] as Attachments}
      />,
    );
    expect(screen.getByText('Dr. Jansen')).toBeInTheDocument();
    expect(screen.queryByText('noDataCaptured')).not.toBeInTheDocument();
  });
});

describe('StudyCohortExplorer — tab navigation', () => {
  it('switches to the 6.1 cohort tab and shows its data', () => {
    render(
      <StudyCohortExplorer
        studyCohorts={[makeCohort({ inclusionCriteria: 'Adults over 18' })]}
        includesControls={false}
        includesRelatives={false}
        attachments={[] as Attachments}
      />,
    );
    fireEvent.click(screen.getByText('section61Tab'));
    expect(screen.getByText('Adults over 18')).toBeInTheDocument();
  });

  it('shows noDataCaptured on 6.1 tab when there is no COHORT row for the selected country', () => {
    render(
      <StudyCohortExplorer
        studyCohorts={[makeCohort({ role: 'CONTROL' })]}
        includesControls={true}
        includesRelatives={false}
        attachments={[] as Attachments}
      />,
    );
    fireEvent.click(screen.getByText('section61Tab'));
    expect(screen.getByText('noDataCaptured')).toBeInTheDocument();
  });

  it('6.2 tab shows willControlsBeExtracted=no and no control panel when includesControls is false', () => {
    render(
      <StudyCohortExplorer
        studyCohorts={[makeCohort()]}
        includesControls={false}
        includesRelatives={false}
        attachments={[] as Attachments}
      />,
    );
    fireEvent.click(screen.getByText('section62Tab'));
    expect(screen.getByText('no')).toBeInTheDocument();
    expect(screen.queryByText('noDataCaptured')).not.toBeInTheDocument();
  });

  it('6.2 tab renders control-specific extra fields (matchingCriteria) when includesControls is true and a CONTROL row exists', () => {
    const cohorts = [
      makeCohort({ role: 'COHORT' }),
      makeCohort({ id: 'sc-control', role: 'CONTROL', matchingCriteria: 'Age and sex matched', controlsPerCohortPerson: '2' }),
    ];
    render(
      <StudyCohortExplorer studyCohorts={cohorts} includesControls={true} includesRelatives={false} attachments={[] as Attachments} />,
    );
    fireEvent.click(screen.getByText('section62Tab'));
    expect(screen.getByText('yes')).toBeInTheDocument();
    expect(screen.getByText('Age and sex matched')).toBeInTheDocument();
  });

  it('6.3 tab renders relative-specific extra field (relationshipToSubject) when includesRelatives is true and a RELATIVE row exists', () => {
    const cohorts = [
      makeCohort({ role: 'COHORT' }),
      makeCohort({ id: 'sc-relative', role: 'RELATIVE', relationshipToSubject: 'Sibling' }),
    ];
    render(
      <StudyCohortExplorer studyCohorts={cohorts} includesControls={false} includesRelatives={true} attachments={[] as Attachments} />,
    );
    fireEvent.click(screen.getByText('section63Tab'));
    expect(screen.getByText('Sibling')).toBeInTheDocument();
  });
});

describe('StudyCohortExplorer — attachment link', () => {
  it('renders a link to the variables attachment when the ref and matching attachment are present', () => {
    const attachments = [
      { id: 'att-1', description: 'ncp-var-ref-1', filename: 'variables.pdf' },
    ] as unknown as Attachments;
    const cohorts = [
      makeCohort({ variablesAttachmentId: 'ncp-var-ref-1', variablesAttachmentRef: 'variables.pdf' }),
    ];
    render(
      <StudyCohortExplorer studyCohorts={cohorts} includesControls={false} includesRelatives={false} attachments={attachments} />,
    );
    fireEvent.click(screen.getByText('section61Tab'));
    const link = screen.getByText('variables.pdf');
    expect(link.closest('a')).toHaveAttribute('href', '/api/attachments/att-1');
  });
});
