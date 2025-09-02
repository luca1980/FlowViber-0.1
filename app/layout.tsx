import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { ErrorBoundary } from "@/components/error-boundary"
import { Suspense } from "react"
import { ToastProvider } from "@/components/toast-provider"

export const metadata: Metadata = {
  title: "v0 App",
  description: "Created with v0",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
      <body>
        <ToastProvider>
          <Suspense fallback={<div>Loading...</div>}>
            <ErrorBoundary>{children}</ErrorBoundary>
          </Suspense>
        </ToastProvider>
        <Analytics />
      </body>
    </html>
  )
}
