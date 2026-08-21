import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import {
  guessAttachmentMimeType,
  resolveAttachmentBytes,
  mapNcpDetailZipToHdeuPayload,
  NcpDetailMappingError,
  buildControlEntry,
  buildRelativeEntry,
  buildInvoicingDetails,
  buildSection3Fields,
} from '@/lib/ncp-client';

describe('guessAttachmentMimeType', () => {
  it('maps known extensions to their content type', () => {
    expect(guessAttachmentMimeType('protocol.pdf')).toBe('application/pdf');
    expect(guessAttachmentMimeType('cover-letter.DOCX')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(guessAttachmentMimeType('notes.txt')).toBe('text/plain');
  });

  it('falls back to octet-stream for an unknown or missing extension', () => {
    expect(guessAttachmentMimeType('archive.rar')).toBe('application/octet-stream');
    expect(guessAttachmentMimeType('no-extension')).toBe('application/octet-stream');
  });
});

describe('resolveAttachmentBytes', () => {
  it('finds an entry matching the plain filename', () => {
    const zip = new AdmZip();
    zip.addFile('protocol.pdf', Buffer.from('pdf-bytes'));
    const found = resolveAttachmentBytes(zip, undefined, 'protocol.pdf');
    expect(found?.toString()).toBe('pdf-bytes');
  });

  it('finds an entry prefixed with the ncp attachment id', () => {
    const zip = new AdmZip();
    zip.addFile('att-42_protocol.pdf', Buffer.from('pdf-bytes'));
    const found = resolveAttachmentBytes(zip, 'att-42', 'protocol.pdf');
    expect(found?.toString()).toBe('pdf-bytes');
  });

  it('looks one level into a nested zip entry', () => {
    const nested = new AdmZip();
    nested.addFile('protocol.pdf', Buffer.from('nested-bytes'));
    const outer = new AdmZip();
    outer.addFile('application_file.zip', nested.toBuffer());
    const found = resolveAttachmentBytes(outer, undefined, 'protocol.pdf');
    expect(found?.toString()).toBe('nested-bytes');
  });

  it('returns undefined when no entry matches', () => {
    const zip = new AdmZip();
    zip.addFile('unrelated.pdf', Buffer.from('x'));
    expect(resolveAttachmentBytes(zip, undefined, 'protocol.pdf')).toBeUndefined();
  });
});

describe('mapNcpDetailZipToHdeuPayload', () => {
  it('throws NcpDetailMappingError when application_metadata.json is missing', () => {
    const zip = new AdmZip();
    zip.addFile('protocol.pdf', Buffer.from('x'));
    zip.addFile('cover-letter.docx', Buffer.from('y'));

    expect(() => mapNcpDetailZipToHdeuPayload(zip.toBuffer())).toThrow(NcpDetailMappingError);

    try {
      mapNcpDetailZipToHdeuPayload(zip.toBuffer());
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(NcpDetailMappingError);
      const err = e as InstanceType<typeof NcpDetailMappingError>;
      expect(err.message).toContain('application_metadata.json');
      expect(err.attachments.sort()).toEqual(['cover-letter.docx', 'protocol.pdf']);
    }
  });

  it('throws NcpDetailMappingError when the metadata entry is not valid JSON', () => {
    const zip = new AdmZip();
    zip.addFile('application_metadata.json', Buffer.from('{not json'));

    expect(() => mapNcpDetailZipToHdeuPayload(zip.toBuffer())).toThrow(NcpDetailMappingError);
  });
});

describe('buildControlEntry', () => {
  it('returns undefined when no controls will be extracted', () => {
    const entry = { willControlsBeExtracted: { key: 'no', value: 'No' } } as never;
    expect(buildControlEntry(entry, 'NL')).toBeUndefined();
  });

  it('builds a CONTROL entry when controls will be extracted', () => {
    const entry = {
      willControlsBeExtracted: { key: 'yes', value: 'Yes' },
      sizeOfControlGroup: '50',
      extractionCriteriaForControls: 'age-matched',
    } as never;
    const control = buildControlEntry(entry, 'NL');
    expect(control).toMatchObject({ countryId: 'NL', role: 'CONTROL', size: 50, matchingCriteria: 'age-matched' });
  });
});

describe('buildRelativeEntry', () => {
  it('returns undefined when no relatives will be extracted', () => {
    const entry = { willRelativesBeExtracted: { key: 'no', value: 'No' } } as never;
    expect(buildRelativeEntry(entry, 'NL')).toBeUndefined();
  });

  it('builds a RELATIVE entry when relatives will be extracted', () => {
    const entry = {
      willRelativesBeExtracted: { key: 'yes', value: 'Yes' },
      relationshipToStudyCohort: 'sibling',
    } as never;
    const relative = buildRelativeEntry(entry, 'NL');
    expect(relative).toMatchObject({ countryId: 'NL', role: 'RELATIVE', relationshipToSubject: 'sibling' });
  });
});

describe('buildInvoicingDetails', () => {
  it('returns undefined when section4 is absent', () => {
    expect(buildInvoicingDetails(undefined)).toBeUndefined();
  });

  it('maps section4 fields when present', () => {
    const result = buildInvoicingDetails({ fullName: 'A. de Vries', email: 'a@example.org' } as never);
    expect(result).toMatchObject({ fullName: 'A. de Vries', email: 'a@example.org' });
  });
});

describe('buildSection3Fields', () => {
  it('reads the natural-person fields when legalOrNaturalPerson is natural', () => {
    const section3 = {
      legalOrNaturalPerson: { key: 'natural', value: 'Natural person' },
      naturalPersonName: 'A. de Vries',
      naturalPersonEmail: 'a@example.org',
      naturalPersonAffiliation: 'UMC Utrecht',
      contactPersonName: 'Should not be used',
      contactPersonEmail: 'wrong@example.org',
      legalPersonName: 'Wrong Org',
    } as never;
    const fields = buildSection3Fields(section3);
    expect(fields.isNaturalPerson).toBe(true);
    expect(fields.applicantName).toBe('A. de Vries');
    expect(fields.applicantEmail).toBe('a@example.org');
    expect(fields.applicantOrganisation).toBe('UMC Utrecht');
  });

  it('reads the legal-person / contact-person fields when legalOrNaturalPerson is legal', () => {
    const section3 = {
      legalOrNaturalPerson: { key: 'legal', value: 'Legal person' },
      naturalPersonName: 'Should not be used',
      contactPersonName: 'S. Bakker',
      contactPersonEmail: 's@example.org',
      legalPersonName: 'UMC Utrecht',
    } as never;
    const fields = buildSection3Fields(section3);
    expect(fields.isNaturalPerson).toBe(false);
    expect(fields.applicantName).toBe('S. Bakker');
    expect(fields.applicantEmail).toBe('s@example.org');
    expect(fields.applicantOrganisation).toBe('UMC Utrecht');
  });

  it('falls back to defaults when neither branch has a value', () => {
    const section3 = { legalOrNaturalPerson: { key: 'legal', value: 'Legal person' } } as never;
    const fields = buildSection3Fields(section3);
    expect(fields.applicantName).toBe('Not specified');
    expect(fields.applicantEmail).toBe('unknown@unknown.invalid');
    expect(fields.applicantOrganisation).toBe('Unknown');
  });
});
