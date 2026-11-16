'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useAuthorization } from '@/lib/authorization'
import type { DashboardType } from '@/lib/dashboard-settings'

const SystemDashboard = dynamic(() => import('./system-dashboard'), {
  loading: () => <p role="status" className="p-6 text-sm text-muted-foreground">Loading dashboard…</p>,
})

export default function DashboardPage() {
  const authorization = useAuthorization()
  if (!authorization.can('Dashboard', 'view')) return null
  return <DashboardContent key={authorization.dashboardType} type={authorization.dashboardType} embedUrl={authorization.powerBiEmbedUrl} />
}

function DashboardContent({ type, embedUrl }: { type: DashboardType; embedUrl: string | null }) {
  const [active, setActive] = useState<'system' | 'powerbi'>(type === 'powerbi' ? 'powerbi' : 'system')

  return <div className="space-y-4">
    {type === 'both' && <div role="group" aria-label="Dashboard view" className="inline-flex max-w-full gap-1 rounded-lg border bg-muted/40 p-1">
      {(['system', 'powerbi'] as const).map((view) => <button key={view} type="button"
        aria-pressed={active === view} onClick={() => setActive(view)}
        className={'rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ' + (active === view ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
        {view === 'system' ? 'System Dashboard' : 'Power BI Dashboard'}
      </button>)}
    </div>}
    {active === 'system' ? <SystemDashboard /> : <section aria-label="Power BI Dashboard" className="w-full min-w-0" style={{ containerType: 'inline-size' }}>
      <h1 className="sr-only">Power BI Dashboard</h1>
      {/* Preserve the 2086:1220 report canvas, plus 56px for Power BI's bottom bar. */}
      {embedUrl ? <iframe title="Feed Sales Forecast Reports" src={embedUrl}
        className="block w-full border-0" style={{ height: 'calc(100cqw * 1220 / 2086 + 56px)' }} allowFullScreen />
        : <p role="status" className="p-6 text-sm text-muted-foreground">The Power BI report is currently unavailable. Contact your administrator.</p>}
    </section>}
  </div>
}
