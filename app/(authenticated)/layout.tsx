"use client"

import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"
import { usePathname } from "next/navigation"
import { AuthorizationProvider } from "@/lib/authorization"
import { ForecastAttentionProvider } from "@/lib/use-forecast-attention"

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  const pageTitles: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/forecast-input": "Forecast Input",
    "/weekly-sales": "Weekly Sales",
    "/approvals": "Approvals",
    "/budget": "Budget",
    "/actual": "Actual",
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

  return (
    <SidebarProvider>
      <AuthorizationProvider>
      <ForecastAttentionProvider>
      <AppSidebar />
      <main className="w-full min-w-0">
        <div className="flex h-14 items-center border-b px-4">
          <h1 className="text-lg leading-tight font-semibold">
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
