import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { NewApplicationTabs } from '@/components/NewApplicationTabs';
import { UserSwitcher } from '@/components/UserSwitcher';

export default async function NewApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ userId?: string }>;
}) {
  const { locale } = await params;
  const { userId: queryUserId } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'applications' });

  const [applicants, dataHolders, allUsers] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'APPLICANT' },
      orderBy: { name: 'asc' },
      include: { dataUser: { select: { name: true } } },
    }),
    prisma.dataHolder.findMany({ orderBy: { name: 'asc' } }),
    prisma.user.findMany({ orderBy: { name: 'asc' } }),
  ]);

  const currentUser =
    (queryUserId ? allUsers.find((u) => u.id === queryUserId) : null) ??
    allUsers.find((u) => u.role === 'CASE_HANDLER') ??
    allUsers.find((u) => u.role === 'ADMIN') ??
    allUsers[0];

  if (!currentUser) return null;

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <div className="text-sm text-gray-500 mb-2">
          <a href={`/${locale}/applications`} className="hover:text-gray-900">{t('title')}</a>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{t('new')}</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{t('new')}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t('typeDataAccess')}
        </p>
      </div>
      <div className="mb-6">
        <UserSwitcher users={allUsers} currentUserId={currentUser.id} />
      </div>
      <NewApplicationTabs
        applicants={applicants}
        dataHolders={dataHolders}
        currentUser={currentUser}
        locale={locale}
        manualLabel={t('manualEntry')}
        hdeuLabel={t('import')}
        ncpLabel={t('ncpFetch')}
      />
    </div>
  );
}
