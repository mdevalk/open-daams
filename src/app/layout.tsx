import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HDAB-NL | DAAMS',
  description: 'Data Access Application Management System — HDAB-NL',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className="rvo-theme utrecht-document">

        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-blue-900 focus:ring-2"
        >
          Ga naar hoofdinhoud
        </a>

        <header className="hdab-page-header">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14">
              <div className="flex items-center gap-3">
                <span className="font-bold text-xl tracking-tight">HDAB-NL</span>
                <span className="text-white/40 text-lg">|</span>
                <span className="text-white/90 font-medium">DAAMS</span>
                <span className="ml-2 rounded text-xs bg-white/20 px-2 py-0.5 font-mono">beta</span>
              </div>
              <nav aria-label="Hoofdnavigatie" className="flex items-center gap-1">
                {[
                  { href: '/', label: 'Dashboard' },
                  { href: '/applications', label: 'Aanvragen' },
                  { href: '/import', label: 'HD@EU import' },
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
                  href="/applications/new"
                  className="ml-2 px-4 py-1.5 rounded text-sm font-semibold bg-white text-[#154273] hover:bg-white/90 transition-colors"
                >
                  + Nieuwe aanvraag
                </a>
              </nav>
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
                <p className="font-semibold text-gray-900 mb-2">HDAB-NL</p>
                <p>Health Data Access Body Nederland</p>
                <p className="mt-1 text-xs">Onderdeel van RIVM</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900 mb-2">Juridische grondslag</p>
                <p>EHDS Verordening (EU) 2025/327</p>
                <p className="mt-1 text-xs">Artikelen 46, 67–69</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900 mb-2">Standaarden</p>
                <p>TEHDAS2 D6.4 DAAMS-specificatie</p>
                <p className="mt-1 text-xs">
                  <a href="https://nldesignsystem.nl" className="text-[#01689b] hover:underline" target="_blank" rel="noreferrer">NL Design System</a>
                  {' — '}
                  <a href="https://tehdas.eu" className="text-[#01689b] hover:underline" target="_blank" rel="noreferrer">TEHDAS2</a>
                </p>
              </div>
            </div>
            <p className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-400">
              HDAB-NL DAAMS is open source (EUPL). Gebouwd volgens het{' '}
              <a href="https://nldesignsystem.nl" className="text-[#01689b] hover:underline" target="_blank" rel="noreferrer">NL Design System</a>{' '}
              met de{' '}
              <a href="https://github.com/nl-design-system-community/rijkshuisstijl-community" className="text-[#01689b] hover:underline" target="_blank" rel="noreferrer">Rijkshuisstijl Community</a>-componenten.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
