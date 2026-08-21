import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    authzFailureLog: { create: vi.fn() },
  },
}));

import { prisma } from '@/lib/db';
import { POST, dataAccessApplicationFields, dataAccessApplicationDefaults } from './route';

const findUnique = vi.mocked(prisma.user.findUnique);
const logCreate = vi.mocked(prisma.authzFailureLog.create);

const APPLICANT = { id: 'u-2', role: 'APPLICANT' as const, name: 'A. de Vries', email: 'researcher@umcu.nl' };

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/applications', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('dataAccessApplicationFields', () => {
  it('transforms all data-access-only fields from the request body', () => {
    const body = {
      cohortFormationMethod: 'RANDOM_SAMPLE',
      dataSubjectsInformed: true,
      dataSubjectsInformedDetail: 'Informed via consent form',
      includesControls: true,
      controlsDescription: 'Matched controls',
      includesRelatives: true,
      relativesDescription: 'First-degree relatives',
      otherDataToCombine: true,
      otherDataDescription: 'Registry linkage',
      speName: 'SPE-1',
      speTechnicalRequirements: '8 vCPU',
      dataAccessTiming: 'LATER',
      dataAccessLaterDate: '2026-09-01',
      transfersOutsideEuEea: true,
      transferCountries: ['US'],
      transferLegalBasis: 'SCC',
      dataController: 'UMC Utrecht',
      lawfulnessOfProcessing: ['ARTICLE_9_2_J'],
    };

    expect(dataAccessApplicationFields(body)).toEqual({
      cohortFormationMethod: 'RANDOM_SAMPLE',
      dataSubjectsInformed: true,
      dataSubjectsInformedDetail: 'Informed via consent form',
      includesControls: true,
      controlsDescription: 'Matched controls',
      includesRelatives: true,
      relativesDescription: 'First-degree relatives',
      otherDataToCombine: true,
      otherDataDescription: 'Registry linkage',
      speName: 'SPE-1',
      speTechnicalRequirements: '8 vCPU',
      dataAccessTiming: 'LATER',
      dataAccessLaterDate: new Date('2026-09-01'),
      transfersOutsideEuEea: true,
      transferCountries: ['US'],
      transferLegalBasis: 'SCC',
      dataController: 'UMC Utrecht',
      lawfulnessOfProcessing: ['ARTICLE_9_2_J'],
    });
  });

  it('falls back to null/false/[] for every field when the body is empty', () => {
    expect(dataAccessApplicationFields({})).toEqual({
      cohortFormationMethod: null,
      dataSubjectsInformed: null,
      dataSubjectsInformedDetail: null,
      includesControls: false,
      controlsDescription: null,
      includesRelatives: false,
      relativesDescription: null,
      otherDataToCombine: false,
      otherDataDescription: null,
      speName: null,
      speTechnicalRequirements: null,
      dataAccessTiming: null,
      dataAccessLaterDate: null,
      transfersOutsideEuEea: false,
      transferCountries: [],
      transferLegalBasis: null,
      dataController: null,
      lawfulnessOfProcessing: [],
    });
  });

  it('does not convert dataAccessLaterDate when absent', () => {
    expect(dataAccessApplicationFields({ dataAccessLaterDate: null }).dataAccessLaterDate).toBeNull();
  });

  it('preserves explicit false/0 via ?? instead of falling back to the default (dataSubjectsInformed)', () => {
    expect(dataAccessApplicationFields({ dataSubjectsInformed: false }).dataSubjectsInformed).toBe(false);
  });
});

describe('dataAccessApplicationDefaults', () => {
  it('returns all keys explicitly set to their default value, none omitted', () => {
    const defaults = dataAccessApplicationDefaults();
    expect(Object.keys(defaults).sort()).toEqual(
      [
        'cohortFormationMethod',
        'controlsDescription',
        'dataAccessLaterDate',
        'dataAccessTiming',
        'dataController',
        'dataSubjectsInformed',
        'dataSubjectsInformedDetail',
        'includesControls',
        'includesRelatives',
        'lawfulnessOfProcessing',
        'otherDataDescription',
        'otherDataToCombine',
        'relativesDescription',
        'speName',
        'speTechnicalRequirements',
        'transferCountries',
        'transferLegalBasis',
        'transfersOutsideEuEea',
      ].sort(),
    );
    expect(defaults).toEqual({
      cohortFormationMethod: null,
      dataSubjectsInformed: null,
      dataSubjectsInformedDetail: null,
      includesControls: false,
      controlsDescription: null,
      includesRelatives: false,
      relativesDescription: null,
      otherDataToCombine: false,
      otherDataDescription: null,
      speName: null,
      speTechnicalRequirements: null,
      dataAccessTiming: null,
      dataAccessLaterDate: null,
      transfersOutsideEuEea: false,
      transferCountries: [],
      transferLegalBasis: null,
      dataController: null,
      lawfulnessOfProcessing: [],
    });
  });
});

describe('POST /api/applications guard clauses', () => {
  beforeEach(() => {
    findUnique.mockReset();
    logCreate.mockReset();
  });

  it('rejects a missing actingUserId with 401', async () => {
    const res = await POST(postRequest({ applicantId: 'u-2', type: 'DATA_ACCESS_APPLICATION' }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('A valid acting user id is required');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects an unknown actingUserId with 401', async () => {
    findUnique.mockResolvedValue(null);
    const res = await POST(postRequest({ actingUserId: 'ghost', applicantId: 'u-2', type: 'DATA_ACCESS_APPLICATION' }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Acting user not found');
  });

  it('rejects an APPLICANT creating an application for a different applicantId with 403', async () => {
    findUnique.mockResolvedValue(APPLICANT as never);
    const res = await POST(
      postRequest({ actingUserId: 'u-2', applicantId: 'someone-else', type: 'DATA_ACCESS_APPLICATION' }),
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('An applicant may only create their own application');
  });
});
