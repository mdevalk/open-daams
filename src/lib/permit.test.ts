import { describe, it, expect } from 'vitest';
import { formatPermitId } from '@/lib/permit';

describe('formatPermitId', () => {
  it('shows the bare permit number for version 1', () => {
    expect(formatPermitId('DP-NL-2025-0001', 1)).toBe('DP-NL-2025-0001');
  });

  it('appends the version suffix for later versions (D6.4 R9.3.8)', () => {
    expect(formatPermitId('DP-NL-2025-0001', 2)).toBe('DP-NL-2025-0001-v2');
    expect(formatPermitId('DP-NL-2025-0001', 5)).toBe('DP-NL-2025-0001-v5');
  });
});
