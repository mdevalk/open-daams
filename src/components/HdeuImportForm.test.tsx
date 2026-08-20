// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { HdeuImportForm } from './HdeuImportForm';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

afterEach(cleanup);

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

describe('HdeuImportForm — mode toggle', () => {
  it('shows the paste textarea by default and switches to the file input in "file" mode', () => {
    render(<HdeuImportForm actingUserId="u-1" />);
    expect(screen.getByPlaceholderText('{ "hdeuApplicationId": "...", ... }')).toBeInTheDocument();

    fireEvent.click(screen.getByText('modeFile'));
    expect(screen.queryByPlaceholderText('{ "hdeuApplicationId": "...", ... }')).not.toBeInTheDocument();
    expect(screen.getByText('uploadLabel')).toBeInTheDocument();
  });
});

describe('HdeuImportForm — load sample', () => {
  it('populates the textarea with sample JSON when "loadSample" is clicked', () => {
    render(<HdeuImportForm actingUserId="u-1" />);
    const textarea = screen.getByPlaceholderText('{ "hdeuApplicationId": "...", ... }') as HTMLTextAreaElement;
    expect(textarea.value).toBe('');

    fireEvent.click(screen.getByText('loadSample'));
    expect(textarea.value).not.toBe('');
    expect(() => JSON.parse(textarea.value)).not.toThrow();
    const parsed = JSON.parse(textarea.value);
    expect(parsed.title).toBe('Test Data Access Application for PoC demo');
  });
});

describe('HdeuImportForm — submit', () => {
  it('disables the import button until JSON is entered', () => {
    render(<HdeuImportForm actingUserId="u-1" />);
    expect(screen.getByText('importButton').closest('button')).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('{ "hdeuApplicationId": "...", ... }'), {
      target: { value: '{"a":1}' },
    });
    expect(screen.getByText('importButton').closest('button')).not.toBeDisabled();
  });

  it('shows the invalidJson error without calling fetch when the textarea has malformed JSON', async () => {
    render(<HdeuImportForm actingUserId="u-1" />);
    fireEvent.change(screen.getByPlaceholderText('{ "hdeuApplicationId": "...", ... }'), {
      target: { value: '{not valid' },
    });
    fireEvent.click(screen.getByText('importButton'));

    await waitFor(() => expect(screen.getByText('✗ invalidJson')).toBeInTheDocument());
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts the parsed JSON to the import endpoint and renders a success result with the application link', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ referenceNumber: 'HDAB-2026-0099', id: 'app-99', decisionDeadline: '2026-03-01T00:00:00.000Z' }),
      }),
    );

    render(<HdeuImportForm locale="nl" actingUserId="u-1" />);
    fireEvent.change(screen.getByPlaceholderText('{ "hdeuApplicationId": "...", ... }'), {
      target: { value: '{"title":"Test"}' },
    });
    fireEvent.click(screen.getByText('importButton'));

    await waitFor(() => expect(screen.getByText('✓ importSuccess')).toBeInTheDocument());
    expect(screen.getByText('HDAB-2026-0099')).toBeInTheDocument();

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/import/hdeu?userId=u-1',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'Test' }) }),
    );

    const link = screen.getByText('openApplication →');
    expect(link).toHaveAttribute('href', '/nl/applications/app-99');
  });

  it('renders the error and details when the import endpoint rejects the payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Validation failed', details: ['title is required', 'legalBasis is required'] }),
      }),
    );

    render(<HdeuImportForm actingUserId="u-1" />);
    fireEvent.change(screen.getByPlaceholderText('{ "hdeuApplicationId": "...", ... }'), {
      target: { value: '{"title":""}' },
    });
    fireEvent.click(screen.getByText('importButton'));

    await waitFor(() => expect(screen.getByText('✗ Validation failed')).toBeInTheDocument());
    expect(screen.getByText('title is required')).toBeInTheDocument();
    expect(screen.getByText('legalBasis is required')).toBeInTheDocument();
  });
});
