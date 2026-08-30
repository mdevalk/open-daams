'use client';

import { signIn } from 'next-auth/react';

export function SignInButton({ callbackUrl, label }: { callbackUrl: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => signIn('keycloak', { callbackUrl })}
      className="w-full rounded-lg bg-[#154273] text-white font-semibold py-2.5 hover:bg-[#0f3357] transition-colors"
    >
      {label}
    </button>
  );
}
