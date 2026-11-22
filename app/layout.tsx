import type { Metadata } from "next"
import { Geist } from "next/font/google"
import "./globals.css"
import { ActionDialogsProvider } from '@/components/action-dialogs'

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: "Feeds Forecast",
  description: "Feeds Forecast System",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="antialiased">
        <ActionDialogsProvider>{children}</ActionDialogsProvider>
      </body>
    </html>
  )
}
