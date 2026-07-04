import { prisma } from '@/lib/db';
import { ApplicationCard } from '@/components/ApplicationCard';
import { ApplicationStatus, ApplicationType } from '@prisma/client';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function ApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; type?: string; search?: string; source?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: 'applications' });
  const tStatus = await getTranslations({ locale, namespace: 'status' });

  const status = sp.status as ApplicationStatus | undefined;
  const type = sp.type as ApplicationType | undefined;
  const search = sp.search;
  const source = sp.source as 'NATIONAL' | 'HDEU' | undefined;

  const applications = await prisma.application.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(source ? { source } : {}),
      ...(search ? {
        OR: [
          { referenceNumber: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    },
    include: {
      applicant: { select: { name: true, organisation: true } },
      caseHandler: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <div className="flex gap-2">
          <a href={`/${locale}/import`} className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100">
            {t('import')}
          </a>
          <a href={`/${locale}/applications/new`} className="rounded-lg bg-[#154273] px-4 py-2 text-sm font-medium text-white hover:bg-[#01689b]">
            {t('new')}
          </a>
        </div>
      </div>

      <form method="GET" className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('searchLabel')}</label>
          <input
            name="search"
            defaultValue={search}
            placeholder={t('searchPlaceholder')}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('statusLabel')}</label>
          <select name="status" defaultValue={status ?? ''} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]">
            <option value="">{t('allStatuses')}</option>
            {(['DRAFT','SUBMITTED','PRE_SCREENING','AWAITING_ADDITIONAL_INFORMATION','PROCESSING','DECISION_ISSUED','WITHDRAWN'] as ApplicationStatus[]).map((s) => (
              <option key={s} value={s}>{tStatus(s)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('typeLabel')}</label>
          <select name="type" defaultValue={type ?? ''} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]">
            <option value="">{t('allTypes')}</option>
            <option value="DATA_ACCESS_APPLICATION">{t('typeDataAccess')}</option>
            <option value="DATA_REQUEST">{t('typeDataRequest')}</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('sourceLabel')}</label>
          <select name="source" defaultValue={source ?? ''} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#01689b]">
            <option value="">{t('allSources')}</option>
            <option value="NATIONAL">{t('sourceNational')}</option>
            <option value="HDEU">{t('sourceHdeu')}</option>
          </select>
        </div>
        <button type="submit" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100">{t('filter')}</button>
        {(status || type || search || source) && (
          <a href={`/${locale}/applications`} className="text-sm text-[#01689b] hover:underline self-end pb-0.5">{t('clearFilter')}</a>
        )}
      </form>

      {applications.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
          <p className="text-gray-500">{t('noResults')}</p>
          <a href={`/${locale}/applications/new`} className="mt-2 inline-block text-sm text-[#01689b] hover:underline">{t('createFirst')}</a>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {applications.map((app) => (
            <ApplicationCard key={app.id} application={app} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
