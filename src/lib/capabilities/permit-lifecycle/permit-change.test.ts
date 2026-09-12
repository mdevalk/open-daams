import { describe, it, expect } from 'vitest';
import { requestableTypes, buildChangeRequestDecisionBody, resolveChangeRequestNavigation } from '@/lib/capabilities/permit-lifecycle/permit-change';

describe('requestableTypes', () => {
  it('allows amendment and renewal on a granted permit', () => {
    expect(requestableTypes('GRANTED')).toEqual(['AMENDMENT', 'RENEWAL']);
  });

  it('allows amendment and renewal on an amended permit', () => {
    expect(requestableTypes('AMENDED')).toEqual(['AMENDMENT', 'RENEWAL']);
  });

  it('only allows amendment on a renewed permit (D6.4 §9.3: no second renewal)', () => {
    expect(requestableTypes('RENEWED')).toEqual(['AMENDMENT']);
  });

  it('only allows a revocation appeal on a revoked permit', () => {
    expect(requestableTypes('REVOKED')).toEqual(['REVOCATION_APPEAL']);
  });

  it('allows nothing further on an expired permit', () => {
    expect(requestableTypes('EXPIRED')).toEqual([]);
  });
});

describe('buildChangeRequestDecisionBody', () => {
  const base = {
    actingUserId: 'u-1',
    comment: '',
    newValidUntil: '',
    effectiveDate: '',
    speOperatorId: '',
    outputControllerName: '',
    outputControllerAffiliation: '',
  };

  it('only carries newValidUntil on an APPROVED RENEWAL', () => {
    const body = buildChangeRequestDecisionBody({ ...base, decision: 'APPROVED', requestType: 'RENEWAL', newValidUntil: '2027-06-01' });
    expect(body.newValidUntil).toBe('2027-06-01');
    expect(body.effectiveDate).toBeUndefined();
    expect(body.speOperatorId).toBeUndefined();
  });

  it('only carries the amendment fields on an APPROVED AMENDMENT', () => {
    const body = buildChangeRequestDecisionBody({
      ...base,
      decision: 'APPROVED',
      requestType: 'AMENDMENT',
      speOperatorId: 'op-1',
      outputControllerName: 'Dr. Jansen',
      outputControllerAffiliation: 'Zorginstelling B',
    });
    expect(body.newValidUntil).toBeUndefined();
    expect(body.speOperatorId).toBe('op-1');
    expect(body.outputControllerName).toBe('Dr. Jansen');
    expect(body.outputControllerAffiliation).toBe('Zorginstelling B');
  });

  it('drops every type-specific field on a REJECTED AMENDMENT (no request type gets special treatment on rejection)', () => {
    const body = buildChangeRequestDecisionBody({
      ...base,
      decision: 'REJECTED',
      requestType: 'AMENDMENT',
      newValidUntil: '2027-06-01',
      speOperatorId: 'op-1',
      outputControllerName: 'Dr. Jansen',
      outputControllerAffiliation: 'Zorginstelling B',
    });
    expect(body.newValidUntil).toBeUndefined();
    expect(body.effectiveDate).toBeUndefined();
    expect(body.speOperatorId).toBeUndefined();
    expect(body.outputControllerName).toBeUndefined();
    expect(body.outputControllerAffiliation).toBeUndefined();
  });

  it('sends the comment as null rather than an empty string', () => {
    expect(buildChangeRequestDecisionBody({ ...base, decision: 'REJECTED', requestType: 'AMENDMENT', comment: '' }).comment).toBeNull();
    expect(buildChangeRequestDecisionBody({ ...base, decision: 'REJECTED', requestType: 'AMENDMENT', comment: 'Too vague' }).comment).toBe(
      'Too vague',
    );
  });
});

describe('resolveChangeRequestNavigation', () => {
  it('pushes to the new permit when it differs from the current one and is not pending', () => {
    expect(resolveChangeRequestNavigation({ newPermitId: 'permit-2', pending: false }, 'permit-1')).toEqual({
      type: 'push',
      permitId: 'permit-2',
    });
  });

  it('refreshes when the new permit is pending activation', () => {
    expect(resolveChangeRequestNavigation({ newPermitId: 'permit-2', pending: true }, 'permit-1')).toEqual({ type: 'refresh' });
  });

  it('refreshes when the new permit id matches the current permit', () => {
    expect(resolveChangeRequestNavigation({ newPermitId: 'permit-1', pending: false }, 'permit-1')).toEqual({ type: 'refresh' });
  });

  it('refreshes when there is no response body', () => {
    expect(resolveChangeRequestNavigation(null, 'permit-1')).toEqual({ type: 'refresh' });
  });
});
