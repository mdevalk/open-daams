'use client';

import { useState } from 'react';
import { User } from '@prisma/client';
import { NewApplicationForm } from './NewApplicationForm';
import { HdeuImportForm } from './HdeuImportForm';
import { NcpFetchForm } from './NcpFetchForm';

type Tab = 'manual' | 'hdeu' | 'ncp';

export function NewApplicationTabs({
  applicants,
  locale,
  manualLabel,
  hdeuLabel,
  ncpLabel,
}: {
  applicants: User[];
  locale: string;
  manualLabel: string;
  hdeuLabel: string;
  ncpLabel: string;
}) {
  const [tab, setTab] = useState<Tab>('manual');

  return (
    <div>
      <div className="flex gap-2 border-b border-gray-200 mb-6">
        {(
          [
            ['manual', manualLabel],
            ['hdeu', hdeuLabel],
            ['ncp', ncpLabel],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-current={tab === value ? 'page' : undefined}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === value
                ? 'border-[#154273] text-[#154273]'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'manual' ? (
        <NewApplicationForm applicants={applicants} />
      ) : tab === 'hdeu' ? (
        <HdeuImportForm locale={locale} />
      ) : (
        <NcpFetchForm locale={locale} />
      )}
    </div>
  );
}
