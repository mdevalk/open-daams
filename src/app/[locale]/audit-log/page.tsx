import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { AuditLogTable } from '@/components/AuditLogTable';

export const dynamic = 'force-dynamic';

export default async function AuditLogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auditLog' });

  const entries = await prisma.auditLog.findMany({
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('description')}</p>
      </div>
      <AuditLogTable entries={entries} locale={locale} />
    </div>
  );
}
