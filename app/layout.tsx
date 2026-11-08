import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ActionDialogsProvider } from '@/components/action-dialogs'

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Feed Sales Forecast",
  description: "Feed Sales Forecast System",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <ActionDialogsProvider>{children}</ActionDialogsProvider>
      </body>
    </html>
  )
}
