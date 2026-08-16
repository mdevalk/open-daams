import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { UserSwitcher } from '@/components/UserSwitcher';
import { MasterdataManager } from '@/components/MasterdataManager';
import { MasterdataAuditLog } from '@/components/MasterdataAuditLog';

export const dynamic = 'force-dynamic';

type Tab = 'data-holders' | 'spe-operators' | 'spe-providers' | 'data-users';
const TABS: Tab[] = ['data-users', 'data-holders', 'spe-operators', 'spe-providers'];

export default async function MasterdataPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; userId?: string }>;
}) {
  const { locale } = await params;
  const { tab: queryTab, userId: queryUserId } = await searchParams;
  const tab: Tab = TABS.includes(queryTab as Tab) ? (queryTab as Tab) : 'data-holders';

  const t = await getTranslations({ locale, namespace: 'masterdata' });

  const [users, dataHolders, speOperators, speProviders, dataUsers, applicantBillingDetailsList, auditLogEntries] =
    await Promise.all([
      prisma.user.findMany({ orderBy: { name: 'asc' } }),
      prisma.dataHolder.findMany({ orderBy: { name: 'asc' } }),
      prisma.speOperator.findMany({
        include: { speProvider: { select: { name: true } }, types: { orderBy: { name: 'asc' } } },
        orderBy: { name: 'asc' },
      }),
      prisma.speProvider.findMany({ orderBy: { name: 'asc' } }),
      prisma.dataUser.findMany({ orderBy: { name: 'asc' } }),
      // Not stored on DataUser — shown by reference: the most recent
      // ApplicantBillingDetails among all applications from any user
      // belonging to that organisation (first per dataUserId wins, since
      // ordered newest-first below).
      prisma.applicantBillingDetails.findMany({
        include: { application: { select: { applicant: { select: { dataUserId: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.findMany({
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

  const billingDetailsByDataUserId = new Map<string, (typeof applicantBillingDetailsList)[number]>();
  for (const bd of applicantBillingDetailsList) {
    const dataUserId = bd.application.applicant.dataUserId;
    if (!billingDetailsByDataUserId.has(dataUserId)) billingDetailsByDataUserId.set(dataUserId, bd);
  }
  const dataUsersForClient = dataUsers.map((du) => ({
    ...du,
    billingDetails: billingDetailsByDataUserId.get(du.id) ?? null,
  }));

  const currentUser =
    (queryUserId ? users.find((u) => u.id === queryUserId) : null) ??
    users.find((u) => u.role === 'ADMIN') ??
    users[0];

  if (!currentUser) return null;

  const isAdmin = currentUser.role === 'ADMIN';

  // Decimal is a class instance, not a plain object — React's server->client
  // prop serialization rejects it outright, so convert before it crosses
  // that boundary (MasterdataManager is a client component).
  const speOperatorsForClient = speOperators.map((op) => ({
    ...op,
    types: op.types.map((t) => ({ ...t, setupFee: t.setupFee.toString(), monthlyFee: t.monthlyFee.toString() })),
  }));

  const tabConfig: Record<Tab, { label: string; apiBasePath: string; namespace: string; entities: unknown[]; relationOptions?: { id: string; name: string }[]; hasTrustedFlag?: boolean; hasSpeTypes?: boolean; hasBillingDetails?: boolean; hasBillingDetailsDisplay?: boolean }> = {
    'data-holders': { label: t('tabDataHolders'), apiBasePath: '/api/data-holders', namespace: 'dataHolders', entities: dataHolders, hasTrustedFlag: true, hasBillingDetails: true },
    'spe-operators': {
      label: t('tabSpeOperators'),
      apiBasePath: '/api/spe-operators',
      namespace: 'speOperators',
      entities: speOperatorsForClient,
      relationOptions: speProviders,
      hasSpeTypes: true,
      hasBillingDetails: true,
    },
    'spe-providers': { label: t('tabSpeProviders'), apiBasePath: '/api/spe-providers', namespace: 'speProviders', entities: speProviders },
    'data-users': { label: t('tabDataUsers'), apiBasePath: '/api/data-users', namespace: 'dataUsers', entities: dataUsersForClient, hasBillingDetailsDisplay: true },
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex gap-2 border-b border-gray-200">
            {TABS.map((tabKey) => (
              <a
                key={tabKey}
                href={`/${locale}/masterdata?tab=${tabKey}${queryUserId ? `&userId=${queryUserId}` : ''}`}
                aria-current={tab === tabKey ? 'page' : undefined}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === tabKey
                    ? 'border-[#154273] text-[#154273]'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                {tabConfig[tabKey].label}
              </a>
            ))}
          </div>

          <MasterdataManager
            key={tab}
            apiBasePath={tabConfig[tab].apiBasePath}
            namespace={tabConfig[tab].namespace}
            entities={tabConfig[tab].entities as never}
            relationOptions={tabConfig[tab].relationOptions}
            hasTrustedFlag={tabConfig[tab].hasTrustedFlag}
            hasSpeTypes={tabConfig[tab].hasSpeTypes}
            hasBillingDetails={tabConfig[tab].hasBillingDetails}
            hasBillingDetailsDisplay={tabConfig[tab].hasBillingDetailsDisplay}
            isAdmin={isAdmin}
            currentUserId={currentUser.id}
          />
        </div>

        <div className="space-y-4">
          <UserSwitcher users={users} currentUserId={currentUser.id} />
          {isAdmin && <MasterdataAuditLog entries={auditLogEntries} locale={locale} />}
        </div>
      </div>
    </div>
  );
}
