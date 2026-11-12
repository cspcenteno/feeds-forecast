"use client"

import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"
import { usePathname } from "next/navigation"
import { AuthorizationProvider } from "@/lib/authorization"
import { ForecastAttentionProvider } from "@/lib/use-forecast-attention"
import {
  LayoutDashboard, ClipboardPenLine, CalendarDays, CheckCircle, Wallet,
  ChartColumn, Tags, Package, ContactRound, Map, MapPinned, Lock, Users,
  ScrollText, type LucideIcon,
} from "lucide-react"

const pageIcons: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/forecasts": ClipboardPenLine,
  "/weekly-sales": CalendarDays,
  "/approvals": CheckCircle,
  "/budgets": Wallet,
  "/actuals": ChartColumn,
  "/categories": Tags,
  "/products": Package,
  "/customers": ContactRound,
  "/regions": Map,
  "/subregions": MapPinned,
  "/week-locks": Lock,
  "/locks": Lock,
  "/users": Users,
  "/audit-logs": ScrollText,
}

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  const pageTitles: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/forecasts": "Forecasts",
    "/weekly-sales": "Weekly Sales",
    "/approvals": "Approvals",
    "/budgets": "Budgets",
    "/actuals": "Actuals",
    "/categories": "Categories",
    "/products": "Products",
    "/customers": "Customers",
    "/regions": "Regions",
    "/subregions": "Subregions",
    "/week-locks": "Week Locks",
    "/locks": "Week Locks",
    "/users": "Users",
    "/audit-logs": "Audit Logs",
  }

  const pageTitle = pageTitles[pathname] || "Feed Sales Forecast"
  const PageIcon = pageIcons[pathname]

  return (
    <SidebarProvider>
      <AuthorizationProvider>
      <ForecastAttentionProvider>
      <AppSidebar />
      <main className="w-full min-w-0">
        <div className="flex h-14 items-center border-b px-4">
          <h1 className="flex items-center gap-2 text-lg leading-tight font-semibold">
            {PageIcon && <PageIcon className="size-5 shrink-0" aria-hidden="true" />}
            {pageTitle}
          </h1>
        </div>

        <div className="app-tables p-4 md:p-6">
          {children}
        </div>
      </main>
      </ForecastAttentionProvider>
      </AuthorizationProvider>
    </SidebarProvider>
  )
}
