import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { requireCurrentUser } from '@/lib/current-user';
import { MasterdataManager } from '@/components/MasterdataManager';
import { MasterdataAuditLog } from '@/components/MasterdataAuditLog';
import { ContactsManager } from '@/components/ContactsManager';

export const dynamic = 'force-dynamic';

type Tab = 'data-holders' | 'spe-operators' | 'spe-providers' | 'data-users' | 'contacts';
const TABS: Tab[] = ['data-users', 'data-holders', 'spe-operators', 'spe-providers', 'contacts'];

export default async function MasterdataPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await params;
  const { tab: queryTab } = await searchParams;
  const tab: Tab = TABS.includes(queryTab as Tab) ? (queryTab as Tab) : 'data-holders';
  const currentUser = await requireCurrentUser(locale);

  const t = await getTranslations({ locale, namespace: 'masterdata' });

  const [dataHolders, speOperators, speProviders, dataUsers, applicantBillingDetailsList, auditLogEntries, contacts] =
    await Promise.all([
      prisma.dataHolder.findMany({ orderBy: { name: 'asc' }, include: { contacts: true } }),
      prisma.speOperator.findMany({
        include: { speProvider: { select: { name: true } }, types: { orderBy: { name: 'asc' } }, contacts: true },
        orderBy: { name: 'asc' },
      }),
      prisma.speProvider.findMany({ orderBy: { name: 'asc' }, include: { contacts: true } }),
      prisma.dataUser.findMany({ orderBy: { name: 'asc' }, include: { contacts: true } }),
      // Not stored on DataUser — shown by reference: the most recent
      // ApplicantBillingDetails among all applications from any user
      // belonging to that organisation (first per dataUserId wins, since
      // ordered newest-first below).
      prisma.applicantBillingDetails.findMany({
        include: { application: { select: { applicant: { select: { dataUserId: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      // AuditLog is shared with non-masterdata case-workflow events (Invoice,
      // Appeal, AuthorizedPerson, Application-level actions) — restrict this
      // page's "recent changes" panel to reference-data entity types only.
      // 'SpeOperatorType' is a legacy label predating the SpeType rename,
      // still present on older rows.
      prisma.auditLog.findMany({
        where: {
          entityType: {
            in: ['DataHolder', 'SpeOperator', 'SpeProvider', 'DataUser', 'SpeType', 'SpeOperatorType', 'Contact'],
          },
        },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.contact.findMany({
        include: {
          dataUser: { select: { name: true } },
          dataHolder: { select: { name: true } },
          speOperator: { select: { name: true } },
          speProvider: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
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

  const isAdmin = currentUser.role === 'ADMIN';

  // Decimal is a class instance, not a plain object — React's server->client
  // prop serialization rejects it outright, so convert before it crosses
  // that boundary (MasterdataManager is a client component).
  const speOperatorsForClient = speOperators.map((op) => ({
    ...op,
    types: op.types.map((t) => ({ ...t, setupFee: t.setupFee.toString(), monthlyFee: t.monthlyFee.toString() })),
  }));

  const contactsForClient = contacts.map((c) => {
    const [ownerType, ownerName] = c.dataUser
      ? (['DataUser', c.dataUser.name] as const)
      : c.dataHolder
        ? (['DataHolder', c.dataHolder.name] as const)
        : c.speOperator
          ? (['SpeOperator', c.speOperator.name] as const)
          : (['SpeProvider', c.speProvider?.name ?? '—'] as const);
    return { id: c.id, name: c.name, email: c.email, phone: c.phone, role: c.role, ownerType, ownerName };
  });
  // {id, name} only — speOperators carries Decimal fields on nested `types`
  // (see speOperatorsForClient above) that the client-side owner picker
  // doesn't need and can't receive unconverted.
  const owners = {
    DataUser: dataUsers.map((o) => ({ id: o.id, name: o.name })),
    DataHolder: dataHolders.map((o) => ({ id: o.id, name: o.name })),
    SpeOperator: speOperators.map((o) => ({ id: o.id, name: o.name })),
    SpeProvider: speProviders.map((o) => ({ id: o.id, name: o.name })),
  };

  const tabLabels: Record<Tab, string> = {
    'data-holders': t('tabDataHolders'),
    'spe-operators': t('tabSpeOperators'),
    'spe-providers': t('tabSpeProviders'),
    'data-users': t('tabDataUsers'),
    contacts: t('tabContacts'),
  };

  const tabConfig: Record<
    Exclude<Tab, 'contacts'>,
    { apiBasePath: string; namespace: string; entities: unknown[]; relationOptions?: { id: string; name: string }[]; hasTrustedFlag?: boolean; hasSpeTypes?: boolean; hasBillingDetails?: boolean; hasBillingDetailsDisplay?: boolean }
  > = {
    'data-holders': { apiBasePath: '/api/data-holders', namespace: 'dataHolders', entities: dataHolders, hasTrustedFlag: true, hasBillingDetails: true },
    'spe-operators': {
      apiBasePath: '/api/spe-operators',
      namespace: 'speOperators',
      entities: speOperatorsForClient,
      relationOptions: speProviders,
      hasSpeTypes: true,
      hasBillingDetails: true,
    },
    'spe-providers': { apiBasePath: '/api/spe-providers', namespace: 'speProviders', entities: speProviders },
    'data-users': { apiBasePath: '/api/data-users', namespace: 'dataUsers', entities: dataUsersForClient, hasBillingDetailsDisplay: true },
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
                href={`/${locale}/masterdata?tab=${tabKey}`}
                aria-current={tab === tabKey ? 'page' : undefined}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === tabKey
                    ? 'border-[#154273] text-[#154273]'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                {tabLabels[tabKey]}
              </a>
            ))}
          </div>

          {tab === 'contacts' ? (
            <ContactsManager
              contacts={contactsForClient}
              owners={owners}
              isAdmin={isAdmin}
              currentUserId={currentUser.id}
            />
          ) : (
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
          )}
        </div>

        <div className="space-y-4">
          {isAdmin && <MasterdataAuditLog entries={auditLogEntries} locale={locale} />}
        </div>
      </div>
    </div>
  );
}
