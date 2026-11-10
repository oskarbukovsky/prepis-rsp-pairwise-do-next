import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'RSP Pairwise | Webová alternativa ACTS',
  description: 'Statický prototyp nástroje pro generování pairwise testovacích scénářů.',
  generator: 'Next.js',
}

export const viewport: Viewport = {
  colorScheme: 'dark light',
  themeColor: '#121316',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="cs"><body>{children}</body></html>
}
