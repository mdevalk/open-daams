import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import '../globals.css';
import { APP_NAME } from '@/lib/branding';
import { prisma } from '@/lib/db';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: APP_NAME,
    description: `Community DAAMS implementation — ${APP_NAME}`,
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages();
  const t = await getTranslations({ locale, namespace: 'nav' });
  const tFooter = await getTranslations({ locale, namespace: 'footer' });
  const tLang = await getTranslations({ locale, namespace: 'lang' });
  const referenceList = tFooter.raw('standardsList') as { ref: string; title: string; url: string }[];

  const locales = ['nl', 'en', 'fr'] as const;

  // R8.0.5 — in-app due-date "notification": an aggregate, non-personalized
  // count (this layout has no session/user context to scope it further —
  // matches the app's existing full-caseload-visibility design). Same
  // where-clauses as the dashboard's own overdue/due-soon queries
  // (src/app/[locale]/page.tsx), just counted instead of listed in full.
  const now = new Date();
  const in14Days = new Date(now.getTime() + 14 * 86_400_000);
  const [overdueDecisionCount, dueSoonDecisionCount] = await Promise.all([
    prisma.application.count({
      where: { decisionDeadline: { lt: now }, status: { notIn: ['DECISION_ISSUED', 'WITHDRAWN'] } },
    }),
    prisma.application.count({
      where: { decisionDeadline: { gte: now, lt: in14Days }, status: { notIn: ['DECISION_ISSUED', 'WITHDRAWN'] } },
    }),
  ]);
  const attentionCount = overdueDecisionCount + dueSoonDecisionCount;

  return (
    <html lang={locale}>
      <body className="rvo-theme utrecht-document">
        <NextIntlClientProvider messages={messages}>

          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-blue-900 focus:ring-2"
          >
            {t('skipToContent')}
          </a>

          <header className="hdab-page-header">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-14">
                <div className="flex items-center gap-3">
                  <a href={`/${locale}`} className="font-bold text-xl tracking-tight">{APP_NAME}</a>
                  <span className="ml-1 rounded text-xs bg-amber-400/90 text-amber-950 px-2 py-0.5 font-semibold tracking-wide">
                    {t('testEnvironment')}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <nav aria-label="Hoofdnavigatie" className="flex items-center gap-1">
                    {[
                      { href: `/${locale}/applications`, label: t('applications') },
                      { href: `/${locale}/permits`, label: t('permits') },
                      { href: `/${locale}/financials`, label: t('financials') },
                      { href: `/${locale}/reference-data`, label: t('referenceData') },
                      { href: `/${locale}/security-log`, label: t('securityLog') },
                    ].map((item) => (
                      <a
                        key={item.href}
                        href={item.href}
                        className="px-3 py-1.5 rounded text-sm hover:bg-white/10 transition-colors"
                      >
                        {item.label}
                      </a>
                    ))}
                  </nav>
                  {attentionCount > 0 && (
                    <a
                      href={`/${locale}`}
                      title={t('dueDateAlerts', { count: attentionCount })}
                      className="ml-3 pl-3 border-l border-white/20 flex items-center gap-1 text-sm text-amber-200 hover:text-white transition-colors"
                    >
                      <span aria-hidden="true">⚠️</span>
                      <span>{attentionCount}</span>
                    </a>
                  )}
                  <nav aria-label="Overige navigatie" className="flex items-center gap-1 ml-3 pl-3 border-l border-white/20">
                    {[
                      { href: `/${locale}/public`, label: t('public') },
                    ].map((item) => (
                      <a
                        key={item.href}
                        href={item.href}
                        className="px-3 py-1.5 rounded text-sm hover:bg-white/10 transition-colors"
                      >
                        {item.label}
                      </a>
                    ))}
                  </nav>
                  <div className="flex items-center gap-1 ml-3 pl-3 border-l border-white/20">
                    {locales.map(l => (
                      <a
                        key={l}
                        href={`/${l}`}
                        className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                          l === locale
                            ? 'hdab-btn-primary bg-white'
                            : 'text-white/80 hover:bg-white/10'
                        }`}
                      >
                        {tLang(l)}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </header>

          <main id="main-content" className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>

          <footer className="mt-16 border-t-4 border-[#154273] bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm text-gray-600">
                <div>
                  <p className="font-semibold text-gray-900 mb-2">{tFooter('hdab')}</p>
                  <p>{tFooter('hdabSub')}</p>
                  <p className="mt-1 text-xs">{tFooter('hdabOrg')}</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-2">{tFooter('legal')}</p>
                  <p>{tFooter('legalRef')}</p>
                  <p className="mt-1 text-xs">{tFooter('legalArticles')}</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-2">{tFooter('standards')}</p>
                  <ul className="space-y-1.5">
                    {referenceList.map((item) => (
                      <li key={item.ref}>
                        <a href={item.url} className="font-medium text-[#01689b] hover:underline" target="_blank" rel="noreferrer">
                          {item.ref}
                        </a>
                        <span className="block text-xs">{item.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-gray-200 text-xs text-gray-500 space-y-1">
                <p>{tFooter('disclaimer')}</p>
                <p>
                  {tFooter('openSource', {
                    nlDesignSystem: tFooter('nlDesignSystem'),
                    rijkshuisstijl: tFooter('rijkshuisstijl'),
                  })}
                </p>
              </div>
            </div>
          </footer>

        </NextIntlClientProvider>
      </body>
    </html>
  );
}
