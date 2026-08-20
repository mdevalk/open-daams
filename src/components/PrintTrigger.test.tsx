// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PrintTrigger } from './PrintTrigger';

afterEach(cleanup);

describe('PrintTrigger', () => {
  it('calls window.print after the short delay, not immediately', () => {
    vi.useFakeTimers();
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    render(<PrintTrigger />);
    expect(printSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(printSpy).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
    printSpy.mockRestore();
  });

  it('renders no visible DOM output', () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'print').mockImplementation(() => {});

    const { container } = render(<PrintTrigger />);
    expect(container).toBeEmptyDOMElement();

    vi.useRealTimers();
  });
});
