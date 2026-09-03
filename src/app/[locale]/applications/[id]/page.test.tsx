// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// page.tsx also exports the async RSC default export, which pulls in prisma
// and next-auth (via @/lib/current-user) — neither loads under jsdom, and
// neither is exercised by the section-component tests below.
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/current-user', () => ({ requireCurrentUser: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn() }));

// CompletenessCheckPanel/AssessmentCheckPanel (rendered by the sections below)
// are client components that call useRouter/useTranslations directly.
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({ notFound: vi.fn(), useRouter: () => ({ refresh: vi.fn() }) }));

import {
  CompletenessSection,
  AssessmentSection,
  BillingSection,
  DataRequestDetailsSection,
  OtherDataSection,
  AdditionalInfoSection,
  ConsentSection,
  DatasetVariablesSection,
} from './page';

afterEach(cleanup);

const t = ((key: string) => key) as never;
const currentUser = { id: 'u-1', role: 'APPLICANT' } as never;

describe('CompletenessSection', () => {
  it('renders nothing outside pre-screening with no existing check', () => {
    const { container } = render(
      <CompletenessSection
        application={{ id: 'a-1', status: 'PROCESSING', completenessCheck: null } as never}
        currentUser={currentUser}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders once status is PRE_SCREENING', () => {
    const { container } = render(
      <CompletenessSection
        application={{ id: 'a-1', status: 'PRE_SCREENING', completenessCheck: null } as never}
        currentUser={currentUser}
      />,
    );
    expect(container).not.toBeEmptyDOMElement();
  });

  it('renders once a completenessCheck already exists, regardless of status', () => {
    const { container } = render(
      <CompletenessSection
        application={{
          id: 'a-1',
          status: 'PROCESSING',
          completenessCheck: { items: [], result: 'COMPLETE', remarks: null },
        } as never}
        currentUser={currentUser}
      />,
    );
    expect(container).not.toBeEmptyDOMElement();
  });
});

describe('AssessmentSection', () => {
  it('renders nothing outside processing with no existing check', () => {
    const { container } = render(
      <AssessmentSection
        application={{ id: 'a-1', status: 'PRE_SCREENING', assessmentCheck: null } as never}
        currentUser={currentUser}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders once status is PROCESSING', () => {
    const { container } = render(
      <AssessmentSection
        application={{ id: 'a-1', status: 'PROCESSING', assessmentCheck: null } as never}
        currentUser={currentUser}
      />,
    );
    expect(container).not.toBeEmptyDOMElement();
  });
});

describe('BillingSection', () => {
  it('renders nothing when billingDetails is null', () => {
    const { container } = render(<BillingSection billingDetails={null} t={t} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the organisation name when billingDetails is present', () => {
    render(
      <BillingSection
        billingDetails={{
          fullName: null,
          email: null,
          organisationName: 'Acme Research BV',
          invoiceType: null,
          vatNumber: null,
          isProjectFinanciallyCovered: null,
          financingAmountRange: null,
        } as never}
        t={t}
      />,
    );
    expect(screen.getByText('Acme Research BV')).toBeInTheDocument();
  });
});

function baseDataRequestApplication(overrides: Record<string, unknown> = {}) {
  return {
    type: 'DATA_REQUEST',
    ethicalReviewInput: null,
    whatIsTheFrequencyOfUpdates: null,
    tabulationPlan: null,
    tabulationPlans: [],
    ...overrides,
  } as never;
}

describe('DataRequestDetailsSection', () => {
  it('renders nothing for a DATA_ACCESS_APPLICATION even with content', () => {
    const { container } = render(
      <DataRequestDetailsSection
        application={baseDataRequestApplication({ type: 'DATA_ACCESS_APPLICATION', tabulationPlan: 'plan text' })}
        t={t}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a DATA_REQUEST with no detail fields set', () => {
    const { container } = render(<DataRequestDetailsSection application={baseDataRequestApplication()} t={t} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders once a DATA_REQUEST has a tabulation plan', () => {
    render(
      <DataRequestDetailsSection
        application={baseDataRequestApplication({ tabulationPlan: 'Cross-tabulate by age band' })}
        t={t}
      />,
    );
    expect(screen.getByText('Cross-tabulate by age band')).toBeInTheDocument();
  });
});

function baseOtherDataApplication(overrides: Record<string, unknown> = {}) {
  return {
    otherDataToCombine: false,
    otherDataDescription: null,
    otherDataCountries: [],
    otherDataHolders: [],
    otherDataDatabases: [],
    otherDataDatasets: [],
    otherDataCombinationMethod: null,
    hasPendingPermitApplications: false,
    pendingApplicationIssuer: null,
    pendingApplicationPermitCode: null,
    pendingApplicationDate: null,
    relatedDataPermits: [],
    ...overrides,
  } as never;
}

describe('OtherDataSection', () => {
  it('renders nothing when nothing is flagged', () => {
    const { container } = render(<OtherDataSection application={baseOtherDataApplication()} t={t} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders once relatedDataPermits is non-empty', () => {
    const { container } = render(
      <OtherDataSection
        application={baseOtherDataApplication({
          relatedDataPermits: [{ id: 'p-1', permitIssuer: 'CBS', permitIdentificationInformation: 'DP-1', permitStartDateOfIssue: null, permitEndDateOfIssue: null }],
        })}
        t={t}
      />,
    );
    expect(container).not.toBeEmptyDOMElement();
  });
});

describe('AdditionalInfoSection', () => {
  it('renders nothing with no additional info and no matching attachments', () => {
    const { container } = render(
      <AdditionalInfoSection application={{ additionalInformation: null, attachments: [] } as never} t={t} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the additional information text when set', () => {
    render(
      <AdditionalInfoSection
        application={{ additionalInformation: 'Nothing further to add.', attachments: [] } as never}
        t={t}
      />,
    );
    expect(screen.getByText('Nothing further to add.')).toBeInTheDocument();
  });
});

function baseConsentApplication(overrides: Record<string, unknown> = {}) {
  return {
    consentAwareProcessingFee: null,
    consentAwareChargeFee: null,
    consentAwareInformationCorrect: null,
    consentNoAccessToUnderlyingData: null,
    consentAcceptHealthDataBody: null,
    ...overrides,
  } as never;
}

describe('ConsentSection', () => {
  it('renders nothing when every consent field is null', () => {
    const { container } = render(<ConsentSection application={baseConsentApplication()} t={t} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders once at least one consent field is set', () => {
    const { container } = render(
      <ConsentSection application={baseConsentApplication({ consentAcceptHealthDataBody: true })} t={t} />,
    );
    expect(container).not.toBeEmptyDOMElement();
  });
});

describe('DatasetVariablesSection', () => {
  it('renders nothing for an empty group list', () => {
    const { container } = render(<DatasetVariablesSection groups={[]} t={t} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the variable name for a non-empty group', () => {
    render(
      <DatasetVariablesSection
        groups={[
          {
            sourceDatasetId: 'ds-1',
            name: 'Hospital admissions',
            url: undefined,
            variables: [{ id: 'v-1', name: 'age_band', datatype: 'string', title: null, description: null, propertyUrl: null } as never],
          },
        ]}
        t={t}
      />,
    );
    expect(screen.getByText('age_band')).toBeInTheDocument();
  });
});
