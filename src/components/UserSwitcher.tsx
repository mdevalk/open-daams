'use client';

import { User } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

type Props = { users: User[]; currentUserId: string };

export function UserSwitcher({ users, currentUserId }: Props) {
  const t = useTranslations('userSwitcher');
  const tr = useTranslations('roles');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function switchUser(userId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('userId', userId);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="rounded border border-gray-200 bg-white p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('label')}</p>
      <div className="space-y-1">
        {users.map(u => {
          const active = u.id === currentUserId;
          return (
            <button
              key={u.id}
              onClick={() => switchUser(u.id)}
              className={`w-full text-left rounded px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-[#154273] text-white'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              <span className="font-medium">{u.name}</span>
              <span className={`ml-2 text-xs ${
                active ? 'text-white/70' : 'text-gray-400'
              }`}>
                {tr(u.role)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
