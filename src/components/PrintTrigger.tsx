'use client';

import { useEffect } from 'react';

export function PrintTrigger() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);
  return null;
}
