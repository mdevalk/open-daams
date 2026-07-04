'use client';

import { User } from '@prisma/client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

const ROLE_LABELS: Record<string, string> = {
  APPLICANT:      'Aanvrager',
  CASE_HANDLER:   'Behandelaar',
  DECISION_MAKER: 'Beslisser',
  DATA_HOLDER:    'Datahouder',
  ADMIN:          'Beheerder',
};

type Props = { users: User[]; currentUserId: string };

export function UserSwitcher({ users, currentUserId }: Props) {
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
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Actief als</p>
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
                {ROLE_LABELS[u.role] ?? u.role}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
