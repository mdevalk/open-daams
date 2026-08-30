import { describe, it, expect } from 'vitest';
import { buildApplicationCreateBody, type ApplicationFormState } from '@/lib/application-form';

const APPLICANT_USER = { id: 'u-2', role: 'APPLICANT' } as const;
const CASE_HANDLER_USER = { id: 'u-1', role: 'CASE_HANDLER' } as const;

function baseState(overrides: Partial<ApplicationFormState> = {}): ApplicationFormState {
  return {
    dataHolderGroups: [],
    decisionTrack: 'STANDARD',
    cohortSizeIsEstimate: 'true',
    extractionMethod: '',
    extractionFrequency: '',
    extractionInterval: '',
    usesOptOutException: false,
    cohortFormationMethod: '',
    dataSubjectsInformed: '',
    includesControls: false,
    includesRelatives: false,
    otherDataToCombine: false,
    dataAccessTiming: 'AS_SOON_AS_POSSIBLE',
    transfersOutsideEuEea: false,
    lawfulness: [],
    ...overrides,
  };
}

function formData(fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return form;
}

describe('buildApplicationCreateBody — applicant id', () => {
  it('uses the current user id for an APPLICANT, ignoring any submitted applicantId', () => {
    const body = buildApplicationCreateBody('DATA_REQUEST', APPLICANT_USER, formData({ applicantId: 'other' }), baseState());
    expect(body.applicantId).toBe('u-2');
  });

  it('uses the submitted applicantId for a non-APPLICANT', () => {
    const body = buildApplicationCreateBody('DATA_REQUEST', CASE_HANDLER_USER, formData({ applicantId: 'chosen-applicant' }), baseState());
    expect(body.applicantId).toBe('chosen-applicant');
  });
});

describe('buildApplicationCreateBody — requestedDatasets', () => {
  it('drops groups without a data holder and datasets without a name', () => {
    const state = baseState({
      dataHolderGroups: [
        { id: 'g1', dataHolderId: 'dh-1', datasets: [{ id: 'd1', name: 'GP records', url: '' }, { id: 'd2', name: '  ', url: '' }] },
        { id: 'g2', dataHolderId: '', datasets: [{ id: 'd3', name: 'Ignored', url: '' }] },
      ],
    });
    const body = buildApplicationCreateBody('DATA_REQUEST', APPLICANT_USER, formData(), state);
    expect(body.requestedDatasets).toEqual([{ dataHolderId: 'dh-1', datasets: [{ name: 'GP records', url: null }] }]);
  });
});

describe('buildApplicationCreateBody — DATA_ACCESS_APPLICATION fields', () => {
  it('includes the data-access-only fields and omits tabulationPlan', () => {
    const body = buildApplicationCreateBody('DATA_ACCESS_APPLICATION', APPLICANT_USER, formData(), baseState()) as Record<string, unknown>;
    expect(body).toHaveProperty('cohortFormationMethod');
    expect(body).not.toHaveProperty('tabulationPlan');
  });

  it('resolves dataSubjectsInformed as a tri-state (unset/true/false)', () => {
    expect(
      buildApplicationCreateBody('DATA_ACCESS_APPLICATION', APPLICANT_USER, formData(), baseState({ dataSubjectsInformed: '' })).dataSubjectsInformed,
    ).toBeNull();
    expect(
      buildApplicationCreateBody('DATA_ACCESS_APPLICATION', APPLICANT_USER, formData(), baseState({ dataSubjectsInformed: 'true' })).dataSubjectsInformed,
    ).toBe(true);
    expect(
      buildApplicationCreateBody('DATA_ACCESS_APPLICATION', APPLICANT_USER, formData(), baseState({ dataSubjectsInformed: 'false' })).dataSubjectsInformed,
    ).toBe(false);
  });

  it('only includes dataAccessLaterDate when timing is LATER', () => {
    const asap = buildApplicationCreateBody(
      'DATA_ACCESS_APPLICATION', APPLICANT_USER, formData({ dataAccessLaterDate: '2027-01-01' }),
      baseState({ dataAccessTiming: 'AS_SOON_AS_POSSIBLE' }),
    );
    expect(asap.dataAccessLaterDate).toBeNull();

    const later = buildApplicationCreateBody(
      'DATA_ACCESS_APPLICATION', APPLICANT_USER, formData({ dataAccessLaterDate: '2027-01-01' }),
      baseState({ dataAccessTiming: 'LATER' }),
    );
    expect(later.dataAccessLaterDate).toBe('2027-01-01');
  });

  it('only splits transferCountries when transfersOutsideEuEea is set', () => {
    const off = buildApplicationCreateBody(
      'DATA_ACCESS_APPLICATION', APPLICANT_USER, formData({ transferCountries: 'DE, FR' }),
      baseState({ transfersOutsideEuEea: false }),
    );
    expect(off.transferCountries).toEqual([]);
    expect(off.transferLegalBasis).toBeNull();

    const on = buildApplicationCreateBody(
      'DATA_ACCESS_APPLICATION', APPLICANT_USER, formData({ transferCountries: 'DE, FR', transferLegalBasis: 'Art. 46' }),
      baseState({ transfersOutsideEuEea: true }),
    );
    expect(on.transferCountries).toEqual(['DE', 'FR']);
    expect(on.transferLegalBasis).toBe('Art. 46');
  });

  it('nulls out the controls/relatives/other-data descriptions when their flag is off', () => {
    const body = buildApplicationCreateBody(
      'DATA_ACCESS_APPLICATION', APPLICANT_USER,
      formData({ controlsDescription: 'x', relativesDescription: 'y', otherDataDescription: 'z' }),
      baseState({ includesControls: false, includesRelatives: false, otherDataToCombine: false }),
    );
    expect(body.controlsDescription).toBeNull();
    expect(body.relativesDescription).toBeNull();
    expect(body.otherDataDescription).toBeNull();
  });
});

describe('buildApplicationCreateBody — DATA_REQUEST fields', () => {
  it('includes tabulationPlan and omits data-access-only fields', () => {
    const body = buildApplicationCreateBody(
      'DATA_REQUEST', APPLICANT_USER, formData({ tabulationPlan: 'Age x sex table' }), baseState(),
    ) as Record<string, unknown>;
    expect(body.tabulationPlan).toBe('Age x sex table');
    expect(body).not.toHaveProperty('cohortFormationMethod');
  });
});

describe('buildApplicationCreateBody — shared extraction fields', () => {
  it('only carries an extractionInterval when frequency is MULTIPLE_TIMES', () => {
    const once = buildApplicationCreateBody(
      'DATA_REQUEST', APPLICANT_USER, formData(), baseState({ extractionFrequency: 'ONCE', extractionInterval: 'YEARLY' }),
    );
    expect(once.extractionInterval).toBeNull();

    const multiple = buildApplicationCreateBody(
      'DATA_REQUEST', APPLICANT_USER, formData(), baseState({ extractionFrequency: 'MULTIPLE_TIMES', extractionInterval: 'YEARLY' }),
    );
    expect(multiple.extractionInterval).toBe('YEARLY');
  });
});
