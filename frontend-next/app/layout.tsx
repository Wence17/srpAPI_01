import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import Providers from '@/components/Providers'

export const metadata: Metadata = {
  title: 'Sub2API Next',
  description: 'Next.js conversion scaffold for Sub2API frontend',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 selection:bg-brand-300 selection:text-slate-900">
        <Providers>
          <div className="flex min-h-screen flex-col">
            <header className="border-b border-slate-200 bg-white/90 px-4 py-4 shadow-sm backdrop-blur">
              <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-slate-900">Sub2API Next</p>
                  <p className="text-sm text-slate-500">Scaffolded Next.js migration of the Sub2API frontend</p>
                </div>
              </div>
            </header>
            <main className="flex-1 px-4 py-6">
              <div className="mx-auto max-w-7xl">{children}</div>
            </main>
            <footer className="border-t border-slate-200 bg-white/90 px-4 py-4 text-center text-sm text-slate-500">
              Generated scaffold with all Sub2API frontend routes and placeholders.
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  )
}
