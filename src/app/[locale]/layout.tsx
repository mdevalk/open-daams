import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import '../globals.css';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'HDAB-NL | DAAMS',
    description: 'Data Access Application Management System — HDAB-NL',
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
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  const locales = ['nl', 'en', 'fr'] as const;

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
                  <a href={`/${locale}`} className="font-bold text-xl tracking-tight">HDAB-NL</a>
                  <span className="text-white/40 text-lg">|</span>
                  <span className="text-white/90 font-medium">DAAMS</span>
                  <span className="ml-2 rounded text-xs bg-white/20 px-2 py-0.5 font-mono">{tCommon('beta')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <nav aria-label="Hoofdnavigatie" className="flex items-center gap-1">
                    {[
                      { href: `/${locale}`, label: t('dashboard') },
                      { href: `/${locale}/applications`, label: t('applications') },
                      { href: `/${locale}/permits`, label: t('permits') },
                      { href: `/${locale}/import`, label: t('import') },
                    ].map((item) => (
                      <a
                        key={item.href}
                        href={item.href}
                        className="px-3 py-1.5 rounded text-sm hover:bg-white/10 transition-colors"
                      >
                        {item.label}
                      </a>
                    ))}
                    <a
                      href={`/${locale}/applications/new`}
                      className="hdab-btn-primary ml-2 px-4 py-1.5 rounded text-sm font-semibold bg-white hover:bg-white/90 transition-colors"
                    >
                      {t('newApplication')}
                    </a>
                  </nav>
                  {/* Taalschakelaar */}
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
                  <p>{tFooter('standardsRef')}</p>
                  <p className="mt-1 text-xs">
                    <a href="https://nldesignsystem.nl" className="text-[#01689b] hover:underline" target="_blank" rel="noreferrer">
                      {tFooter('nlDesignSystem')}
                    </a>
                    {' — '}
                    <a href="https://tehdas.eu" className="text-[#01689b] hover:underline" target="_blank" rel="noreferrer">TEHDAS2</a>
                  </p>
                </div>
              </div>
            </div>
          </footer>

        </NextIntlClientProvider>
      </body>
    </html>
  );
}
