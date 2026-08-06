import { NextResponse } from 'next/server';

/**
 * Builds a binary file response, applying RFC 2616 quoted-string escaping to
 * the filename before it goes into Content-Disposition — some callers pass
 * externally-sourced filenames (e.g. NCP attachments), so this is applied
 * unconditionally rather than trusted per-caller.
 */
export function fileResponse(
  bytes: Buffer | Uint8Array,
  filename: string,
  options: { mimeType: string; disposition?: 'inline' | 'attachment'; cacheControl?: string },
): NextResponse {
  const safeFilename = filename.replace(/[\\"]/g, '\\$&');
  const disposition = options.disposition ?? 'attachment';
  const headers: Record<string, string> = {
    'Content-Type': options.mimeType,
    'Content-Disposition': `${disposition}; filename="${safeFilename}"`,
  };
  if (options.cacheControl) headers['Cache-Control'] = options.cacheControl;

  return new NextResponse(new Uint8Array(bytes), { status: 200, headers });
}
