import { prisma } from '@/lib/db';
import { ApplicationCard } from '@/components/ApplicationCard';
import { ApplicationStatus } from '@prisma/client';
import { cn } from '@/lib/utils';
import { getTranslations } from 'next-intl/server';
import { formatDate, daysUntil } from '@/lib/utils';
import { formatPermitId } from '@/lib/permit';
import { CHANGE_TYPE_LABELS } from '@/lib/permit-change';

export const dynamic = 'force-dynamic';

type Item = { id: string; href: string; title: string; subtitle: string };

// One urgency tier of the "Needs attention" section. Always visible; shows a
// muted empty state rather than disappearing, so all three tiers are a
// stable, glanceable set rather than a shifting layout.
function AttentionTier({
  emoji, title, items, borderColor, bgColor, textColor, emptyLabel,
}: {
  emoji: string;
  title: string;
  items: Item[];
  borderColor: string;
  bgColor: string;
  textColor: string;
  emptyLabel: string;
}) {
  const isEmpty = items.length === 0;
  return (
    <div className={cn('rounded border-l-4 p-4', isEmpty ? 'border-gray-200 bg-gray-50' : cn(borderColor, bgColor))}>
      <div className="flex items-center gap-2 mb-3">
        <span aria-hidden="true">{emoji}</span>
        <h3 className={cn('font-semibold', isEmpty ? 'text-gray-500' : textColor)}>{title} ({items.length})</h3>
      </div>
      {isEmpty ? (
        <p className="text-sm text-gray-400">{emptyLabel}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <a
              key={item.id}
              href={item.href}
              className="block rounded border border-gray-200 bg-white px-3 py-2 hover:border-gray-300 transition-colors"
            >
              <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
              <p className="text-xs text-gray-500 truncate">{item.subtitle}</p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'dashboard' });

  const now = new Date();
  const in14Days = new Date(now.getTime() + 14 * 86_400_000);

  // Matches the 14-day "warning" threshold in lib/workflow.ts's deadlineStatus().
  function dayLabel(date: Date | null): string {
    const days = daysUntil(date);
    if (days === null) return '';
    return days < 0 ? t('daysOverdue', { count: Math.abs(days) }) : t('daysRemaining', { count: days });
  }

  const [
    applications,
    byStatus,
    appsOverdueDecision,
    appsOverdueInfo,
    appsDueSoonDecision,
    appsAwaitingPreScreening,
    permitsExpired,
    permitsExpiringSoon,
    changeRequestsPending,
    invoicesOverdue,
    invoicesDueSoon,
  ] = await Promise.all([
    prisma.application.findMany({
      include: {
        applicant: { select: { name: true, organisation: true } },
        caseHandler: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    }),
    prisma.application.groupBy({ by: ['status'], _count: { id: true } }),
    prisma.application.findMany({
      where: { decisionDeadline: { lt: now }, status: { notIn: ['DECISION_ISSUED', 'WITHDRAWN'] } },
      select: { id: true, referenceNumber: true, title: true, decisionDeadline: true },
    }),
    prisma.application.findMany({
      where: { status: 'AWAITING_ADDITIONAL_INFORMATION', additionalInfoDeadline: { lt: now } },
      select: { id: true, referenceNumber: true, title: true, additionalInfoDeadline: true },
    }),
    prisma.application.findMany({
      where: { decisionDeadline: { gte: now, lt: in14Days }, status: { notIn: ['DECISION_ISSUED', 'WITHDRAWN'] } },
      select: { id: true, referenceNumber: true, title: true, decisionDeadline: true },
    }),
    prisma.application.findMany({
      where: { status: 'SUBMITTED' },
      select: { id: true, referenceNumber: true, title: true, submittedAt: true },
    }),
    prisma.dataPermit.findMany({
      where: { isCurrent: true, validUntil: { lt: now }, status: { notIn: ['EXPIRED', 'REVOKED'] } },
      select: {
        id: true, permitNumber: true, version: true, validUntil: true,
        application: { select: { referenceNumber: true } },
      },
    }),
    prisma.dataPermit.findMany({
      where: { isCurrent: true, validUntil: { gte: now, lt: in14Days }, status: { notIn: ['EXPIRED', 'REVOKED'] } },
      select: {
        id: true, permitNumber: true, version: true, validUntil: true,
        application: { select: { referenceNumber: true } },
      },
    }),
    prisma.permitChangeRequest.findMany({
      where: { status: 'REQUESTED' },
      select: {
        id: true, type: true, requestedAt: true,
        permit: { select: { id: true, permitNumber: true, version: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { status: 'ISSUED', dueAt: { lt: now } },
      select: { id: true, invoiceNumber: true, dueAt: true },
    }),
    prisma.invoice.findMany({
      where: { status: 'ISSUED', dueAt: { gte: now, lt: in14Days } },
      select: { id: true, invoiceNumber: true, dueAt: true },
    }),
  ]);

  const activeStatuses: ApplicationStatus[] = [
    'SUBMITTED', 'PRE_SCREENING', 'AWAITING_ADDITIONAL_INFORMATION', 'PROCESSING',
  ];
  const activeCount = byStatus
    .filter((r) => activeStatuses.includes(r.status))
    .reduce((sum, r) => sum + r._count.id, 0);
  const total = byStatus.reduce((sum, r) => sum + r._count.id, 0);
  const completedCount = byStatus
    .filter((r) => r.status === 'DECISION_ISSUED')
    .reduce((sum, r) => sum + r._count.id, 0);

  const overdueItems: Item[] = [
    ...appsOverdueDecision.map((a): Item => ({
      id: `app-dl-${a.id}`,
      href: `/${locale}/applications/${a.id}`,
      title: `${a.referenceNumber} — ${a.title}`,
      subtitle: `${t('decisionDeadlineLabel')}: ${formatDate(a.decisionDeadline)} (${dayLabel(a.decisionDeadline)})`,
    })),
    ...appsOverdueInfo.map((a): Item => ({
      id: `app-info-${a.id}`,
      href: `/${locale}/applications/${a.id}`,
      title: `${a.referenceNumber} — ${a.title}`,
      subtitle: `${t('additionalInfoDeadlineLabel')}: ${formatDate(a.additionalInfoDeadline)} (${dayLabel(a.additionalInfoDeadline)})`,
    })),
    ...permitsExpired.map((p): Item => ({
      id: `permit-exp-${p.id}`,
      href: `/${locale}/permits/${p.id}`,
      title: `${formatPermitId(p.permitNumber, p.version)} — ${p.application.referenceNumber}`,
      subtitle: t('permitExpiredLabel'),
    })),
    ...invoicesOverdue.map((inv): Item => ({
      id: `invoice-${inv.id}`,
      href: `/${locale}/invoices/${inv.id}`,
      title: inv.invoiceNumber,
      subtitle: `${t('invoiceDueLabel')}: ${formatDate(inv.dueAt)} (${dayLabel(inv.dueAt)})`,
    })),
  ];

  const dueSoonItems: Item[] = [
    ...appsDueSoonDecision.map((a): Item => ({
      id: `app-dl-soon-${a.id}`,
      href: `/${locale}/applications/${a.id}`,
      title: `${a.referenceNumber} — ${a.title}`,
      subtitle: `${t('decisionDeadlineLabel')}: ${formatDate(a.decisionDeadline)} (${dayLabel(a.decisionDeadline)})`,
    })),
    ...permitsExpiringSoon.map((p): Item => ({
      id: `permit-soon-${p.id}`,
      href: `/${locale}/permits/${p.id}`,
      title: `${formatPermitId(p.permitNumber, p.version)} — ${p.application.referenceNumber}`,
      subtitle: `${t('permitExpiresLabel')}: ${formatDate(p.validUntil)} (${dayLabel(p.validUntil)})`,
    })),
    ...invoicesDueSoon.map((inv): Item => ({
      id: `invoice-soon-${inv.id}`,
      href: `/${locale}/invoices/${inv.id}`,
      title: inv.invoiceNumber,
      subtitle: `${t('invoiceDueLabel')}: ${formatDate(inv.dueAt)} (${dayLabel(inv.dueAt)})`,
    })),
  ];

  const awaitingDecisionItems: Item[] = [
    ...appsAwaitingPreScreening.map((a): Item => ({
      id: `app-pending-${a.id}`,
      href: `/${locale}/applications/${a.id}`,
      title: `${a.referenceNumber} — ${a.title}`,
      subtitle: `${t('awaitingPreScreeningLabel')} — ${formatDate(a.submittedAt)}`,
    })),
    ...changeRequestsPending.map((cr): Item => ({
      id: `cr-${cr.id}`,
      href: `/${locale}/permits/${cr.permit.id}`,
      title: formatPermitId(cr.permit.permitNumber, cr.permit.version),
      subtitle: `${CHANGE_TYPE_LABELS[cr.type]} ${t('changeRequestPendingLabel')} — ${formatDate(cr.requestedAt)}`,
    })),
  ];

  return (
    <div className="space-y-8">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t('kpiTotal'),       value: total },
          { label: t('kpiActive'),      value: activeCount },
          { label: t('kpiOverdue'),     value: appsOverdueDecision.length, alert: appsOverdueDecision.length > 0 },
          { label: t('kpiCompleted'),    value: completedCount },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className={cn(
              'rounded border p-5',
              kpi.alert ? 'border-[#d52b1e] bg-[#fce8e6]' : 'border-gray-200 bg-white',
            )}
          >
            <p className="text-3xl font-bold" style={{ color: kpi.alert ? '#7a1711' : '#154273' }}>
              {kpi.value}
            </p>
            <p className={`text-xs mt-1 ${kpi.alert ? 'text-[#d52b1e] font-medium' : 'text-gray-500'}`}>
              {kpi.label}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <h2 className="font-semibold text-gray-900">{t('attentionTitle')}</h2>
        <AttentionTier
          emoji="🔴"
          title={t('attentionOverdue')}
          items={overdueItems}
          borderColor="border-[#d52b1e]"
          bgColor="bg-[#fce8e6]"
          textColor="text-[#7a1711]"
          emptyLabel={t('attentionEmpty')}
        />
        <AttentionTier
          emoji="🟡"
          title={t('attentionDueSoon')}
          items={dueSoonItems}
          borderColor="border-amber-400"
          bgColor="bg-amber-50"
          textColor="text-amber-800"
          emptyLabel={t('attentionEmpty')}
        />
        <AttentionTier
          emoji="🔵"
          title={t('attentionAwaitingDecision')}
          items={awaitingDecisionItems}
          borderColor="border-[#01689b]"
          bgColor="bg-[#e8f4fb]"
          textColor="text-[#154273]"
          emptyLabel={t('attentionEmpty')}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">{t('recentActivity')}</h2>
          <a href={`/${locale}/applications`} className="text-sm text-[#01689b] hover:underline">
            {t('allApplications')}
          </a>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {applications.map((app) => (
            <ApplicationCard key={app.id} application={app} locale={locale} />
          ))}
        </div>
      </div>
    </div>
  );
}
