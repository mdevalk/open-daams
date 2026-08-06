import { describe, it, expect } from 'vitest';
import { fileResponse } from '@/lib/http';

describe('fileResponse', () => {
  it('sets Content-Type and defaults to an attachment disposition', () => {
    const res = fileResponse(Buffer.from('hello'), 'permit.pdf', { mimeType: 'application/pdf' });
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="permit.pdf"');
  });

  it('supports an inline disposition and a cache-control header', () => {
    const res = fileResponse(Buffer.from('hello'), 'preview.pdf', {
      mimeType: 'application/pdf',
      disposition: 'inline',
      cacheControl: 'no-store',
    });
    expect(res.headers.get('Content-Disposition')).toBe('inline; filename="preview.pdf"');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('escapes quotes and backslashes in externally-sourced filenames', () => {
    const res = fileResponse(Buffer.from('hello'), 'evil".pdf"; foo=bar', { mimeType: 'application/pdf' });
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="evil\\".pdf\\"; foo=bar"');
  });
});
