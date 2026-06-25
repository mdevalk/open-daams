import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HDAB-NL DAAMS',
  description: 'Data Access Application Management System — HDAB-NL',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className="min-h-screen flex flex-col">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-bold text-blue-700 text-lg">HDAB-NL</span>
              <span className="text-gray-300">|</span>
              <span className="text-gray-700 font-medium">DAAMS</span>
            </div>
            <nav className="flex items-center gap-6 text-sm">
              <a href="/" className="text-gray-600 hover:text-gray-900">Dashboard</a>
              <a href="/applications" className="text-gray-600 hover:text-gray-900">Applications</a>
              <a href="/applications/new" className="rounded-lg bg-blue-600 px-3 py-1.5 text-white font-medium hover:bg-blue-700">+ New</a>
            </nav>
          </div>
        </header>
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <footer className="border-t border-gray-200 text-center text-xs text-gray-400 py-4">
          HDAB-NL DAAMS &mdash; implementing TEHDAS2 national workflow &mdash; EHDS Regulation (EU) 2025/327
        </footer>
      </body>
    </html>
  );
}
