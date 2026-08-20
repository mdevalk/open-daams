import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import {
  guessAttachmentMimeType,
  resolveAttachmentBytes,
  mapNcpDetailZipToHdeuPayload,
  NcpDetailMappingError,
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
