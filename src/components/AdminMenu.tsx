'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSession, signIn, signOut } from 'next-auth/react';
import { UserRole } from '@prisma/client';

type UserOption = { id: string; name: string; role: UserRole };

export function AdminMenu({ locale, users }: { locale: string; users: UserOption[] }) {
  const t = useTranslations('nav');
  const ta = useTranslations('auth');
  const tr = useTranslations('roles');
  const { data: session, status, update } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const items = [
    { href: `/${locale}/masterdata`, label: t('masterdata') },
    { href: `/${locale}/audit-log`, label: t('auditLog') },
    { href: `/${locale}/security-log`, label: t('securityLog') },
    { href: `/${locale}/integration-log`, label: t('integrationLog') },
  ];

  const isAdmin = session?.user?.role === 'ADMIN';

  async function actAs(userId: string) {
    setBusy(true);
    try {
      await update({ impersonatedUserId: userId || null });
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      const res = await fetch('/api/auth/keycloak-signout');
      const { url } = (await res.json()) as { url: string | null };
      await signOut({ redirect: false });
      window.location.href = url ?? '/';
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={containerRef} className="relative ml-3 pl-3 border-l border-white/20">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="admin-menu-panel"
        className="px-3 py-1.5 rounded text-sm hover:bg-white/10 transition-colors"
      >
        <span aria-hidden="true">⚙️</span>
        <span className="sr-only">{t('manage')}</span>
      </button>
      {open && (
        <div
          id="admin-menu-panel"
          className="absolute right-0 mt-1 w-64 rounded-lg border border-gray-200 bg-white py-1 shadow-lg z-50"
        >
          {status !== 'loading' && (
            <div className="px-3 py-2 border-b border-gray-100">
              {session?.user ? (
                <>
                  <p className="text-xs text-gray-500">{ta('signedInAs', { name: session.user.name ?? '' })}</p>
                  {isAdmin && (
                    <label className="mt-2 block relative">
                      <span className="sr-only">{ta('actAsSelf')}</span>
                      {/* appearance-none: WebKit/macOS renders a native select's
                          closed-state text with the OS widget, ignoring `color`,
                          unless the browser default appearance is turned off. */}
                      <select
                        value={session.user.impersonatedUserId ?? ''}
                        onChange={(e) => actAs(e.target.value)}
                        disabled={busy}
                        className="mt-1 w-full appearance-none rounded border border-gray-300 bg-white text-sm text-gray-900 pl-2 pr-6 py-1"
                      >
                        <option value="">{ta('actAsSelf')}</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} — {tr(u.role)}
                          </option>
                        ))}
                      </select>
                      <span aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 mt-0.5 -translate-y-1/2 text-gray-500 text-xs">
                        ▾
                      </span>
                    </label>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => signIn('keycloak')}
                  className="text-sm text-gray-700 hover:text-gray-900"
                >
                  {ta('signIn')}
                </button>
              )}
            </div>
          )}
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              {item.label}
            </a>
          ))}
          {session?.user && (
            <div className="border-t border-gray-100">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={busy}
                className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                {ta('signOut')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
