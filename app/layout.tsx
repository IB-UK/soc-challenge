import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'Operation: Dark Harbour | Cardinal Newman College',
  description: 'SOC Challenge — Digital & IT Induction Activity',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${mono.variable} font-sans bg-[#0d1b2e] text-slate-100 min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
