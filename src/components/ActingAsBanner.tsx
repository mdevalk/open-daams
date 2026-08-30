'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';

/**
 * Full-width strip under the header, visible only while an ADMIN has "Act
 * as" active (AdminMenu) — deliberately loud and impossible to miss, since
 * forgetting you're impersonating someone else would be a real footgun.
 */
export function ActingAsBanner() {
  const { data: session, update } = useSession();
  const t = useTranslations('auth');
  const tr = useTranslations('roles');
  const [busy, setBusy] = useState(false);

  const impersonatedName = session?.user?.impersonatedName;
  const impersonatedRole = session?.user?.impersonatedRole;
  if (!impersonatedName || !impersonatedRole) return null;

  async function stop() {
    setBusy(true);
    try {
      await update({ impersonatedUserId: null });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full bg-amber-400/90 text-amber-950 text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex items-center justify-between">
        <span className="font-semibold">
          {t('actingAs', { name: impersonatedName, role: tr(impersonatedRole) })}
        </span>
        <button type="button" onClick={stop} disabled={busy} className="underline decoration-dotted text-xs font-medium">
          {t('stop')}
        </button>
      </div>
    </div>
  );
}
