import { HdeuImportForm } from '@/components/HdeuImportForm';
import { UserSwitcher } from '@/components/UserSwitcher';
import { prisma } from '@/lib/db';
import { getTranslations } from 'next-intl/server';

export default async function ImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ userId?: string }>;
}) {
  const { locale } = await params;
  const { userId: queryUserId } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'import' });

  const users = await prisma.user.findMany({ orderBy: { name: 'asc' } });
  const currentUser =
    (queryUserId ? users.find((u) => u.id === queryUserId) : null) ??
    users.find((u) => u.role === 'CASE_HANDLER') ??
    users.find((u) => u.role === 'ADMIN') ??
    users[0];

  if (!currentUser) return null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
      </div>

      <UserSwitcher users={users} currentUserId={currentUser.id} />

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">{t('infoTitle')}</p>
        <ul className="list-disc list-inside space-y-1 text-blue-700">
          <li>{t('infoItem1')}</li>
          <li>{t('infoItem2')}</li>
          <li>{t('infoItem3')}</li>
          <li>{t('infoItem4')}</li>
        </ul>
      </div>

      <HdeuImportForm locale={locale} actingUserId={currentUser.id} />
    </div>
  );
}
