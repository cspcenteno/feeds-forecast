"use client"

import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"
import { usePathname } from "next/navigation"

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  const pageTitles: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/sales-input": "Sales Input",
    "/weekly-sales": "Weekly Sales",
    "/approvals": "Approvals",
    "/budget": "Budget",
    "/categories": "Categories",
    "/products": "Products",
    "/regions": "Regions",
    "/week-locks": "Week Locks",
    "/users": "Users",
  }

  const pageTitle = pageTitles[pathname] || "Feed Sales Forecast"

  return (
    <SidebarProvider>
      <AppSidebar />

      <main className="w-full min-w-0">
        <div className="flex h-14 items-center border-b px-4">
          <h1 className="text-lg font-semibold">
            {pageTitle}
          </h1>
        </div>

        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>
    </SidebarProvider>
  )
}