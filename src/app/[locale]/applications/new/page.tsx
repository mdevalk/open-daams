import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { NewApplicationTabs } from '@/components/NewApplicationTabs';

export default async function NewApplicationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'applications' });

  const users = await prisma.user.findMany({
    where: { role: 'APPLICANT' },
    orderBy: { name: 'asc' },
  });

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
      <NewApplicationTabs
        applicants={users}
        locale={locale}
        manualLabel={t('manualEntry')}
        hdeuLabel={t('import')}
        ncpLabel={t('ncpFetch')}
      />
    </div>
  );
}
