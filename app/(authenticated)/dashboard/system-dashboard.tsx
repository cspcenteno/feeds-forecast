'use client'

import { SalesHierarchyTable, type SalesHierarchyRow } from '@/components/ui/sales-hierarchy-table'
import { summaryForLevel } from '@/lib/table-summary-level'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronDown, Gauge } from 'lucide-react'
import { dashboardSalesTotals, type DashboardMonthlyReferences } from '@/lib/dashboard-sales-totals'

import { ChartNoAxesCombined as HeadingChartNoAxesCombined, ChartColumn as HeadingChartColumn, ChartPie as HeadingChartPie, Lightbulb as HeadingLightbulb, CalendarDays as HeadingCalendarDays } from 'lucide-react'

import { ExpandCollapseIcon } from '@/components/ui/expand-collapse-icon'
import Link from 'next/link'
import { useForecastAttention } from '@/lib/use-forecast-attention'
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, LoaderCircle, RefreshCw, SquareCheck, Triangle, TriangleAlert } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Table } from '@/components/ui/table'
import { SortableHeader } from '@/components/ui/sortable-header'
import { usePopupError } from '@/components/action-dialogs'
import { budgetComparison } from '@/lib/budget-comparison'
import { compareRegionNames } from '@/lib/region-order'
import { compareVolumes, dashboardComparisons, metricColors, metricLabels, type RegionalVolumes } from '@/lib/dashboard-comparisons'
import { dashboardLevel, type DashboardLevel } from '@/lib/dashboard-performance'
import { useAuthorization } from '@/lib/authorization'
import { SelectionField } from '@/components/ui/selection-field'

type RegionVolume = RegionalVolumes & { key?: string }

type SalesDetail = {
  monthly_references?: DashboardMonthlyReferences
  asm_id?: string | null
  asm_name?: string
  region_id: number | null
  subregion_id: number | null
  customer_id: number | null
  product_id: number | null
  budget_id: number | null
  endorsed_by: string | null
  submitted_by: string | null
  region: string | null
  subregion: string | null
  customer: string | null
  product: string
  endorser: string | null
  submitter: string | null
  quantity: number
  volume: number
  budget: number
  actual: number
  prior_actual: number
  customer_budget?: number
  customer_actual?: number
  customer_prior_actual?: number
  customer_forecast?: number
}

type DashboardData = {
  detailsError?: string
  detailsLoaded?: boolean
  assignedSubregion?: string | null
  showAsm?: boolean
  areaLevel: 'region' | 'subregion'
  scope: 'global' | 'asm' | 'rsm' | 'kam'
  regions: RegionVolume[]
  details: SalesDetail[]
  performance: { level: DashboardLevel; rows: RegionVolume[] }
  actualRecordCount: number
}

type SalesGroup = {
  key: string
  label: string
  area: string
  metrics: number[]
  children: SalesGroup[]
}

const number = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 })

function achievement(forecast: number, budget: number) {
  return budgetComparison(forecast, budget).ratio
}

function varianceColor(value: number) {
  return value < 0 ? 'text-red-700 dark:text-red-400' : value > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
}

function AchievementIndicator({ value }: { value: number | null }) {
  const status = value === null ? 'No positive baseline' : value >= 100 ? 'Target met' : value >= 90 ? 'Near target' : 'Below target'
  const color = value === null ? 'text-muted-foreground bg-muted' : value >= 100
    ? 'text-emerald-600 dark:text-emerald-400'
    : value >= 90 ? 'text-amber-500 dark:text-amber-400'
      : 'text-red-500 dark:text-red-400'
  return <span title={status} aria-label={`${formatPercent(value)}: ${status}`} className={`inline-flex items-center justify-end gap-1.5 font-medium ${color}`}>
    {formatPercent(value)}
    {value !== null && (value >= 100 ? <SquareCheck className="size-4 shrink-0" aria-hidden="true" /> : value >= 90 ? <TriangleAlert className="size-4 shrink-0" aria-hidden="true" /> : <Triangle className="size-3.5 shrink-0 rotate-180" aria-hidden="true" />)}
  </span>
}

function formatPercent(value: number | null) {
  return value === null ? '—' : number.format(value) + '%'
}

function buildSalesGroups(data: DashboardData) {
  const levels: ((row: SalesDetail) => [string | number | null, string])[] = []
  if (data.showAsm) levels.push((row) => [row.asm_id ?? 'unassigned-asm', 'ASM: ' + (row.asm_name || 'Unassigned')])
  if (data.scope === 'global' || data.scope === 'asm') {
    levels.push((row) => [row.endorsed_by, 'RSM: ' + (row.endorser || (row.endorsed_by ? 'Name unavailable' : 'No endorsement recorded'))])
  }
  if (data.scope !== 'kam') {
    levels.push((row) => [row.submitted_by, 'KAM: ' + (row.submitter || 'Name unavailable')])
  }
  levels.push(
    (row) => [row.customer_id, row.customer || 'Unassigned customer'],
    (row) => [row.product_id, row.product || 'Unassigned product'],
  )

  function group(rows: SalesDetail[], depth: number, parent: string): SalesGroup[] {
    const byId = new Map<string | number | null, { label: string; rows: SalesDetail[] }>()
    for (const row of rows) {
      const [id, label] = levels[depth](row)
      const existing = byId.get(id)
      if (existing) existing.rows.push(row)
      else byId.set(id, { label, rows: [row] })
    }

    return [...byId.entries()].map(([id, entry]) => {
      const key = JSON.stringify([parent, id])
      const hasRsm = data.scope === 'global' || data.scope === 'asm'
      const asmDepth = data.showAsm ? 1 : 0
      const isAsm = !!data.showAsm && depth === 0
      const isRsm = hasRsm && depth === asmDepth
      const isScopedTopRow = depth === 0 && (data.scope === 'rsm' || data.scope === 'kam')
      const kamDepth = asmDepth + Number(hasRsm)
      const referenceLevel = isAsm ? 'asm' : isRsm ? 'rsm'
        : data.scope !== 'kam' && depth === kamDepth ? 'kam'
          : depth === levels.length - 1 ? 'product' : 'customer'
      return {
        key,
        label: entry.label,
        area: isAsm || isRsm || isScopedTopRow ? [...new Set(entry.rows.map((row) => (isAsm ? row.region : row.subregion) || '—'))].join(', ') : '',
        metrics: dashboardSalesTotals(entry.rows, depth < levels.length - 1, referenceLevel),
        children: depth + 1 < levels.length ? group(entry.rows, depth + 1, key) : [],
      }
    }).sort((a, b) => a.label.localeCompare(b.label))
  }

  return group(data.details, 0, '')
}

function groupKeys(groups: SalesGroup[]): string[] {
  return groups.flatMap((group) => group.children.length ? [group.key, ...groupKeys(group.children)] : [])
}

const compactNumber = new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 })
const tooltipStyle = { backgroundColor: 'var(--dashboard-tooltip)', color: 'var(--dashboard-tooltip-ink)', borderColor: 'var(--dashboard-grid)', borderRadius: 8, boxShadow: '0 8px 24px rgb(0 0 0 / 0.25)' }

const regionColors = ['#34d399', '#38bdf8', '#a78bfa', '#fbbf24', '#fb7185', '#22d3ee']

const panelTitle = 'border-b border-l-4 border-l-sky-500 bg-sky-50/70 px-3 py-3 text-sm font-semibold text-slate-900 dark:border-l-sky-400 dark:border-b-slate-700 dark:bg-slate-800 dark:text-slate-100'
const panel = 'min-w-0 overflow-hidden rounded-lg border bg-card shadow-sm dark:border-slate-600 dark:bg-slate-900'
const metricAppearance = {
  budget: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/50 dark:bg-amber-950/40 dark:text-amber-200',
  forecast: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/50 dark:bg-emerald-950/40 dark:text-emerald-200',
  actual: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-400/50 dark:bg-sky-950/40 dark:text-sky-200',
}
const comparisonAppearance = {
  'forecast-budget': 'border-emerald-700 bg-emerald-700 text-white dark:border-emerald-400',
  'budget-actual': 'border-sky-700 bg-sky-700 text-white dark:border-sky-400',
  'forecast-actual': 'border-violet-700 bg-violet-700 text-white dark:border-violet-400',
}
const performanceLabels = {
  company: { title: 'Regional Volume Performance', column: 'Region', by: 'Region', plural: 'regions' },
  region: { title: 'Regional Volume performance', column: 'Region', by: 'Region', plural: 'regions' },
  subregion: { title: 'Subregional Volume performance', column: 'Subregion', by: 'Subregion', plural: 'subregions' },
  kam: { title: 'KAM Volume Performance', column: 'KAM', by: 'KAM', plural: 'KAMs' },
  'customer': { title: 'Customer Volume performance', column: 'Customer', by: 'Customer', plural: 'customers' },
}
const shortLabel = (value: string) => value.length > 26 ? value.slice(0, 25) + '…' : value

function countInWords(value: number): string {
  const small = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
  if (value < 20) return small[value]
  if (value < 100) {
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
    return tens[Math.floor(value / 10)] + (value % 10 ? '-' + small[value % 10] : '')
  }
  for (const [scale, label] of [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1000, 'thousand'], [100, 'hundred']] as const) {
    if (value >= scale) return `${countInWords(Math.floor(value / scale))} ${label}${value % scale ? ' ' + countInWords(value % scale) : ''}`
  }
  return String(value)
}

function highlightCount(value: number) {
  const words = countInWords(value)
  return `${words.charAt(0).toUpperCase() + words.slice(1)} (${value.toLocaleString('en-PH')})`
}

function LoadingIndicator({ label }: { label: string }) {
  return (
    <div role="status" className="flex min-h-16 flex-1 items-center justify-center p-3">
      <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <span className="sr-only">Loading {label}…</span>
    </div>
  )
}

export default function SystemDashboard() {
  const authorization = useAuthorization()
  const [, reportError] = usePopupError()
  const attention = useForecastAttention()
  const [month, setMonth] = useState(() => new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric', month: '2-digit', timeZone: 'Asia/Manila',
  }).format(new Date()))
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ month: string; revision: number; data: DashboardData | null; error: string } | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [comparisonId, setComparisonId] = useState<(typeof dashboardComparisons)[number]['id']>('forecast-budget')
  const comparison = dashboardComparisons.find((item) => item.id === comparisonId)!
  const contributionMetric = comparisonId === 'budget-actual' ? 'actual' : comparison.baseline
  const [performanceSort, setPerformanceSort] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>(null)
  const [chartSort, setChartSort] = useState('baseline')
  const [chartDescending, setChartDescending] = useState(true)
  const [comparisonDetailsOpen, setComparisonDetailsOpen] = useState(false)
  const performanceMetrics = [comparison.baseline, comparison.measured]
  const performanceColumnCount = performanceMetrics.length + 3

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch('/api/dashboard?part=overview&month=' + encodeURIComponent(month), { signal: controller.signal, cache: 'no-store' })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error ?? 'Unable to load dashboard data.')
        const data = body as DashboardData
        if (controller.signal.aborted) return
        if (!data) reportError('Dashboard data is unavailable for this account.')
        setResult({
          month, revision, data: data as DashboardData | null,
          error: data ? '' : 'Dashboard data is unavailable for this account.',
        })
        if (!data) return
        // Show the selected month before waiting for hierarchy references.
        try {
          const detailResponse = await fetch('/api/dashboard?part=details&month=' + encodeURIComponent(month), { signal: controller.signal, cache: 'no-store' })
          const detailBody = await detailResponse.json()
          if (!detailResponse.ok) throw new Error(detailBody.error ?? 'Unable to load monthly sales details.')
          if (controller.signal.aborted) return
          setResult({ month, revision, data: { ...data, ...detailBody, detailsLoaded: true }, error: '' })
        } catch (error) {
          if (controller.signal.aborted) return
          reportError(error instanceof Error ? error.message : 'Unable to load monthly sales details.')
          setResult({ month, revision, data: { ...data, detailsLoaded: true, detailsError: 'Unable to load monthly sales details. Refresh to try again.' }, error: '' })
        }
      } catch (error) {
        if (controller.signal.aborted) return
        reportError(error instanceof Error ? error.message : 'Unable to load dashboard data.')
        setResult({ month, revision, data: null, error: error instanceof Error ? error.message : 'Unable to load dashboard data.' })
      }
    }
    void load()
    return () => controller.abort()
  }, [month, revision, reportError])

  const current = result?.month === month && result.revision === revision ? result : null
  const loading = current === null
  const detailsLoading = loading || (!!current?.data && !current.data.detailsLoaded)
  const data = current?.data
  const regions = [...(data?.performance.rows ?? [])].sort((a, b) => compareRegionNames(a.region, b.region))
  const performanceLevel = data?.performance.level ?? dashboardLevel(authorization)
  const performanceLabel = performanceLabels[performanceLevel]
  const sortedPerformance = performanceSort ? [...regions].sort((a, b) => {
    if (performanceSort.key === 'region' && (performanceLevel === 'company' || performanceLevel === 'region')) return compareRegionNames(a.region, b.region)
    const value = (row: RegionVolume) => {
      if (performanceSort.key === 'variance') return Number(row[comparison.measured]) - Number(row[comparison.baseline])
      if (performanceSort.key === 'achievement') return achievement(Number(row[comparison.measured]), Number(row[comparison.baseline]))
      return Number(row[performanceSort.key as 'budget' | 'forecast' | 'actual'])
    }
    const first = value(a)
    const second = value(b)
    if (performanceSort.key !== 'region') {
      if (first === null) return second === null ? 0 : 1
      if (second === null) return -1
    }
    const difference = performanceSort.key === 'region'
      ? a.region.localeCompare(b.region, undefined, { numeric: true, sensitivity: 'base' })
      : first! - second!
    return performanceSort.direction === 'ascending' ? difference : -difference
  }) : regions
  const totals = regions.reduce((sum, row) => ({
    budget: sum.budget + Number(row.budget),
    forecast: sum.forecast + Number(row.forecast),
    actual: sum.actual + Number(row.actual),
  }), { budget: 0, forecast: 0, actual: 0 })
  const { variance, percent } = compareVolumes(totals[comparison.baseline], totals[comparison.measured])
  const monthLabel = new Date(month + '-01T00:00:00Z').toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const highestVolume = regions.reduce<RegionVolume | null>((best, row) => !best || Number(row[comparison.measured]) > Number(best[comparison.measured]) ? row : best, null)
  const lowestAchievement = regions.filter((row) => Number(row[comparison.baseline]) > 0).sort((a, b) =>
    Number(a[comparison.measured]) / Number(a[comparison.baseline]) - Number(b[comparison.measured]) / Number(b[comparison.baseline])
  )[0]
  const lowestPercent = lowestAchievement
    ? achievement(lowestAchievement[comparison.measured], lowestAchievement[comparison.baseline])
    : null
  const lowestPerformers = lowestPercent === null ? [] : regions.filter((row) =>
    Number(row[comparison.baseline]) > 0 &&
    Math.abs(achievement(row[comparison.measured], row[comparison.baseline])! - lowestPercent) < 1e-9
  )
  const chartRows = regions.map((row) => ({
    key: row.key ?? row.region,
    region: row.region,
    budget: Number(row.budget),
    forecast: Number(row.forecast),
    actual: Number(row.actual),
    variance: Number(row[comparison.measured]) - Number(row[comparison.baseline]),
  }))
  const baselineContributionRows = chartRows.filter((row) => row[contributionMetric] > 0)
    .map((row, index) => ({ ...row, fill: regionColors[index % regionColors.length] }))
  const baselineContributionTotal = baselineContributionRows.reduce((sum, row) => sum + row[contributionMetric], 0)
  const sortedChartRows = [...chartRows].sort((a, b) => {
    const nameOrder = a.region.localeCompare(b.region, undefined, { numeric: true, sensitivity: 'base' })
    const difference = chartSort === 'name' ? nameOrder
      : a[chartSort === 'baseline' ? comparison.baseline : comparison.measured] - b[chartSort === 'baseline' ? comparison.baseline : comparison.measured]
    return (chartDescending ? -difference : difference) || nameOrder
  })
  const salesGroups = useMemo(() => data ? buildSalesGroups(data) : [], [data])
  const keys = groupKeys(salesGroups)
  const allExpanded = keys.length > 0 && keys.every((key) => expanded.has(key))

  function monthlyHierarchyRows(groups: SalesGroup[], depth = 0): SalesHierarchyRow[] {
    return groups.flatMap(group => {
      const isGroup=group.children.length>0
      const row: SalesHierarchyRow={key:group.key,kind:isGroup?'group':'product',depth,label:group.label,area:group.area,values:group.metrics,
        expanded:expanded.has(group.key),onToggle:isGroup?()=>setExpanded(current=>{const next=new Set(current);if(next.has(group.key))next.delete(group.key);else next.add(group.key);return next}):undefined}
      return [row,...(isGroup&&expanded.has(group.key)?monthlyHierarchyRows(group.children,depth+1):[])]
    })
  }

  return (
    <div className="sales-dashboard space-y-4 rounded-xl bg-slate-100/70 p-3 dark:bg-slate-950 dark:text-slate-100">
      {attention && (attention.returnedCustomers > 0 || attention.pending > 0 || attention.endorsed > 0) && (
        <div aria-label="Forecasts needing attention" className="flex flex-wrap gap-3">
          {attention.returnedCustomers > 0 && <Link href="/forecasts?status=Returned#saved-forecasts" className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 transition-colors hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200 dark:hover:bg-rose-900/50">{attention.returnedCustomers} customer{attention.returnedCustomers === 1 ? '' : 's'} returned for revision →</Link>}
          {attention.pending > 0 && <Link href="/approvals?stage=Pending" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-900/50">{attention.pending} KAM{attention.pending === 1 ? '' : 's'} awaiting endorsement →</Link>}
          {attention.endorsed > 0 && <Link href="/approvals?stage=Endorsed" className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 transition-colors hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200 dark:hover:bg-blue-900/50">{attention.endorsed} RSM{attention.endorsed === 1 ? '' : 's'} awaiting approval →</Link>}
        </div>
      )}
      <header className="rounded-lg border border-t-4 border-t-emerald-500 bg-card px-4 py-3 shadow-sm dark:border-slate-600 dark:border-t-emerald-400 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <h2 data-section-title="" className="text-base leading-6 font-semibold"><Gauge className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />Sales Performance</h2>
          </div>
          <div className="flex max-w-full items-center gap-2">
            <input aria-label="Month" type="month" value={month} onChange={(event) => {
              if (!event.target.value) return
              setMonth(event.target.value)
              setExpanded(new Set())
            }} className="h-10 w-44 min-w-0 rounded-md border bg-background px-3 text-sm md:w-48" />
            <button data-action-tone="neutral" type="button" aria-label="Refresh dashboard" title="Refresh dashboard" onClick={() => setRevision((value) => value + 1)} disabled={!current}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-sm border bg-background p-0 text-sm hover:bg-muted disabled:opacity-50 md:w-auto md:px-3">
              <RefreshCw className="size-4" aria-hidden="true" /><span className="hidden md:inline">Refresh</span>
            </button>
          </div>
        </div>
      </header>

      {current?.error ? null : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-3" role="group" aria-label="Sales volume controls">
            {[
              { metric: 'budget' as const, label: 'BUDGET', comparison: dashboardComparisons[0] },
              { metric: 'forecast' as const, label: 'FORECAST', comparison: dashboardComparisons[2] },
              { metric: 'actual' as const, label: 'ACTUAL', comparison: dashboardComparisons[1] },
            ].map(({ metric, label, comparison: cardComparison }) => {
              const targetComparison = cardComparison.id
              const active = comparisonId === targetComparison
              const values = compareVolumes(totals[cardComparison.baseline], totals[cardComparison.measured])
              return (
              <div key={label}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('button, summary')) return
                  setComparisonId(targetComparison)
                  setChartSort(metric === cardComparison.baseline ? 'baseline' : 'measured')
                  setChartDescending(true)
                }}
                className={`min-w-0 cursor-pointer self-start rounded-lg border border-t-4 px-2 py-3 text-left shadow-sm transition sm:px-3 sm:py-2.5 ${active ? comparisonAppearance[targetComparison] : metricAppearance[metric]}`}>
              <button type="button" aria-pressed={active} aria-controls="dashboard-comparison-results"
                aria-busy={loading}
                onClick={() => {
                  setComparisonId(targetComparison)
                  setChartSort(metric === cardComparison.baseline ? 'baseline' : 'measured')
                  setChartDescending(true)
                }}
                className="block w-full min-w-0 cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500">
                <span className="flex items-center justify-between gap-1 text-xs font-semibold sm:text-sm"><span className="sm:hidden">{metric === 'budget' ? 'BUDGET' : metric === 'forecast' ? 'FORECAST' : 'ACTUAL'}</span><span className="hidden sm:inline">{label}</span>{active && <CheckCircle2 className="size-3 shrink-0 sm:size-4" aria-hidden="true" />}</span>
                <p className="relative mt-2 pr-6 text-[clamp(0.875rem,4vw,1.25rem)] leading-tight font-bold tabular-nums sm:mt-1 sm:text-2xl">
                  <span className={loading ? 'invisible' : undefined}>{number.format(totals[metric])} <span className="mt-0.5 block text-xs font-medium sm:mt-0 sm:inline">bags</span></span>
                  {loading && <span role="status" className="absolute inset-0 flex items-center justify-center"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /><span className="sr-only">Loading {label.toLowerCase()}</span></span>}
                </p>
              </button>
              <details open={comparisonDetailsOpen} className="group/details relative flow-root">
                <summary onClick={(event) => { event.preventDefault(); setComparisonDetailsOpen((current) => !current) }} className="absolute -right-1 bottom-full flex size-5 cursor-pointer list-none items-center justify-center rounded focus-visible:outline-2 sm:-right-0.5 [&::-webkit-details-marker]:hidden" aria-label={`${comparisonDetailsOpen ? 'Collapse' : 'Expand'} all comparison details`} title="Toggle all comparison details"><ChevronDown className="size-4 transition-transform group-open/details:rotate-180" aria-hidden="true" /></summary>
                <button type="button" aria-pressed={active} aria-controls="dashboard-comparison-results"
                  onClick={() => {
                    setComparisonId(targetComparison)
                    setChartSort(metric === cardComparison.baseline ? 'baseline' : 'measured')
                    setChartDescending(true)
                  }}
                  className="mt-2 block w-full cursor-pointer border-t border-current/20 pt-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-2 sm:gap-y-0.5 sm:pt-2">
                  <span className="block text-[10px] leading-tight font-medium sm:text-xs">{cardComparison.title}</span>
                  <span className="mt-1 flex flex-col items-start gap-1 sm:contents">
                    <span className="text-[clamp(0.875rem,4vw,1.25rem)] leading-tight font-bold tabular-nums sm:col-start-1 sm:row-start-2 sm:text-2xl">{loading ? '—' : formatPercent(values.percent)}</span>
                    <span className={`flex flex-col gap-0.5 self-start text-left text-[10px] leading-tight font-medium tabular-nums sm:contents sm:text-xs ${active ? 'text-white' : values.variance < 0 ? 'text-rose-700 dark:text-rose-300' : values.variance > 0 ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>
                      <span className="sm:col-start-2 sm:row-start-1 sm:text-right">Variance<span className="sm:hidden"> </span></span>
                      <span className="whitespace-nowrap sm:col-start-2 sm:row-start-2 sm:self-end sm:text-right">{loading ? '—' : `${values.variance > 0 ? '+' : ''}${number.format(values.variance)} bags`}</span>
                    </span>
                  </span>
                </button>
              </details>
              </div>
              )
            })}
          </div>


          <div id="dashboard-comparison-results" className="grid gap-3 xl:grid-cols-2">
            <div className="contents">
              <section aria-busy={loading} className={panel + ' order-1 flex flex-col'}>
                <h3 data-section-title="" className={panelTitle}><HeadingChartNoAxesCombined className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />{performanceLabel.title}</h3>
                <Table containerProps={{ className: 'max-h-[22rem] overflow-auto', tabIndex: 0, role: 'region', 'aria-label': `${performanceLabel.title} table` }} className="min-w-[620px] table-fixed text-xs sm:min-w-0">
                  <colgroup>
                    <col className="w-28 sm:w-[24%]" />
                    {performanceMetrics.map((metric) => <col key={metric} />)}
                    <col /><col />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-card text-muted-foreground">
                    <tr>{[performanceLabel.column, ...performanceMetrics.map((metric) => metricLabels[metric]), 'Variance', 'Ach. %'].map((label, index) => {
                      const key = ['region', ...performanceMetrics, 'variance', 'achievement'][index]
                      const className = 'px-1.5 py-3 whitespace-nowrap sm:px-2 ' + (index === 0 ? 'text-left' : 'text-right')
                      if (index === 0) return <th key={key} scope="col" className={className}>{label}</th>
                      return <SortableHeader plain key={key}
                        direction={performanceSort?.key === key ? performanceSort.direction : undefined}
                        onSort={() => setPerformanceSort((current) => ({ key, direction: current?.key === key && current.direction === 'ascending' ? 'descending' : 'ascending' }))}
                        className={className}>{label}</SortableHeader>
                    })}</tr>
                  </thead>
                  <tbody>
                    {sortedPerformance.map((row) => {
                      const difference = Number(row[comparison.measured]) - Number(row[comparison.baseline])
                      return <tr key={row.key ?? row.region} className="border-b even:bg-muted/25">
                        <th scope="row" className="px-1.5 py-2 text-left font-medium wrap-anywhere sm:px-2">{row.region}</th>
                        {performanceMetrics.map((metric) => <td key={metric} className="px-1.5 py-2 text-right tabular-nums whitespace-nowrap sm:px-2">{number.format(row[metric])}</td>)}
                        <td className={'px-1.5 py-2 text-right tabular-nums whitespace-nowrap sm:px-2 ' + varianceColor(difference)}>{number.format(difference)}</td>
                        <td className="px-1.5 py-2 text-right tabular-nums whitespace-nowrap sm:px-2"><AchievementIndicator value={achievement(row[comparison.measured], row[comparison.baseline])} /></td>
                      </tr>
                    })}
                    {regions.length === 0 && <tr><td colSpan={performanceColumnCount} className={loading ? 'h-36 px-3 py-0 text-center text-muted-foreground' : 'px-3 py-3 text-center text-muted-foreground'}>{loading ? <LoadingIndicator label={performanceLabel.title.toLowerCase()} /> : `No volume data by ${performanceLabel.column.toLowerCase()} for the selected month.`}</td></tr>}
                  </tbody>
                  <tfoot className={`sticky bottom-0 border-t-2 bg-card font-semibold ${loading ? 'invisible' : ''}`}>
                    <tr><th scope="row" className="px-1.5 py-2 text-left wrap-anywhere sm:px-2">Grand Total</th>
                      {performanceMetrics.map((metric) => <td key={metric} className="px-1.5 py-2 text-right tabular-nums whitespace-nowrap sm:px-2">{number.format(totals[metric])}</td>)}
                      <td className={'px-1.5 py-2 text-right tabular-nums whitespace-nowrap sm:px-2 ' + varianceColor(variance)}>{number.format(variance)}</td>
                      <td className="px-1.5 py-2 text-right tabular-nums whitespace-nowrap sm:px-2"><AchievementIndicator value={percent} /></td>
                    </tr>
                  </tfoot>
                </Table>
              </section>

              <section aria-busy={loading} className={panel + ' order-3 flex h-[22rem] flex-col'}>
                <h3 data-section-title="" className={panelTitle}><HeadingChartColumn className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />{comparison.title} by {performanceLabel.by} (bags)</h3>
                <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 pt-2 text-xs">
                  <label className="flex items-center gap-2">
                    Sort by
                    <SelectionField aria-label="Chart sort field" value={chartSort} onValueChange={setChartSort} className="h-9 w-32 rounded-md border bg-background px-2">
                      <option value="name">{performanceLabel.column}</option>
                      <option value="baseline">{metricLabels[comparison.baseline]}</option>
                      <option value="measured">{metricLabels[comparison.measured]}</option>
                    </SelectionField>
                  </label>
                  <button type="button" onClick={() => setChartDescending((value) => !value)} className="inline-flex h-9 items-center justify-center rounded-md border px-3 max-md:w-11 max-md:px-0" aria-label="Toggle chart sort direction" title={chartSort === 'name' ? chartDescending ? 'Z–A' : 'A–Z' : chartDescending ? 'Highest first' : 'Lowest first'}>
                    {chartDescending ? <ArrowDownWideNarrow className="size-4 md:hidden" aria-hidden="true" /> : <ArrowUpNarrowWide className="size-4 md:hidden" aria-hidden="true" />}
                    <span className="hidden md:inline">{chartSort === 'name' ? chartDescending ? 'Z–A' : 'A–Z' : chartDescending ? 'Highest first' : 'Lowest first'}</span>
                  </button>
                </div>
                {loading ? <LoadingIndicator label="comparison chart" /> : chartRows.length ? (
                  <div className="min-h-0 flex-1 px-2 py-3 text-xs">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sortedChartRows} accessibilityLayer>
                        <CartesianGrid vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="region" tickLine={false} tickFormatter={shortLabel}
                          tick={performanceLevel === 'customer' ? false : undefined}
                          height={performanceLevel === 'customer' ? 8 : undefined} />
                        <YAxis width={52} tickLine={false} axisLine={false} tickFormatter={(value: number) => compactNumber.format(value)} />
                        <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'var(--popover-foreground)' }}
                          formatter={(value) => number.format(Number(value)) + ' bags'} />
                        <Legend />
                        <Bar dataKey={comparison.baseline} name={metricLabels[comparison.baseline]} fill={metricColors[comparison.baseline]} maxBarSize={40} isAnimationActive={false} />
                        <Bar dataKey={comparison.measured} name={metricLabels[comparison.measured]} fill={metricColors[comparison.measured]} maxBarSize={40} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <p className="p-4 text-sm text-muted-foreground">No {performanceLabel.plural} available for this month.</p>}
              </section>
            </div>

            <div className="contents">
              <section aria-busy={loading} className={panel + ' order-2 flex min-h-64 flex-col'}>
                <h3 data-section-title="" className={panelTitle}><HeadingChartPie className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />{metricLabels[contributionMetric]} Volume Contribution by {performanceLabel.by}</h3>
                {loading ? <LoadingIndicator label="volume contribution chart" /> : baselineContributionRows.length ? (
                  <div className="grid min-h-0 flex-1 items-center gap-3 p-3 sm:grid-cols-2">
                    <div className="relative h-32 min-w-0 text-xs sm:h-44">
                      <ResponsiveContainer width="100%" height="100%" className="relative z-10">
                        <PieChart accessibilityLayer>
                          <Pie data={baselineContributionRows} dataKey={contributionMetric} nameKey="region" innerRadius="62%" outerRadius="92%" stroke="var(--card)" isAnimationActive={false} />
                          <Tooltip wrapperStyle={{ zIndex: 20 }} contentStyle={tooltipStyle} itemStyle={{ color: 'var(--dashboard-tooltip-ink)' }} formatter={(value) => number.format(Number(value)) + ' bags'} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 z-0 grid place-content-center text-center" aria-hidden="true">
                        <span className="text-lg font-semibold tabular-nums">{number.format(baselineContributionTotal)}</span><span className="text-xs text-muted-foreground">bags</span>
                      </div>
                    </div>
                    <ul className="max-h-24 space-y-2 overflow-y-auto pr-1 text-xs sm:max-h-60">
                      {baselineContributionRows.map((row) => <li key={row.key} className="flex items-center gap-2">
                        <span className="size-2.5 shrink-0" style={{ backgroundColor: row.fill }} aria-hidden="true" />
                        <span className="min-w-0 flex-1 wrap-anywhere">{row.region}</span>
                        <span className="tabular-nums">{number.format(row[contributionMetric])}</span>
                        <span className="w-10 text-right tabular-nums text-muted-foreground">{formatPercent(row[contributionMetric] / baselineContributionTotal * 100)}</span>
                      </li>)}
                    </ul>
                  </div>
                ) : <p className="p-4 text-sm text-muted-foreground">No positive {metricLabels[contributionMetric].toLowerCase()} volume for this month.</p>}
                {chartRows.some((row) => row[contributionMetric] < 0) && <p className="px-3 pb-3 text-xs text-muted-foreground">Shares use positive volumes. Negative volumes remain in totals and comparisons.</p>}
              </section>



              <section aria-busy={loading} className={panel + ' order-4 flex max-h-[min(22rem,60dvh)] self-start flex-col md:h-[22rem] md:max-h-none md:self-stretch'}>
                <h3 data-section-title="" className={panelTitle}><HeadingLightbulb className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />Monthly Highlights</h3>
                {loading ? <LoadingIndicator label="monthly highlights" /> : <ol className="min-h-0 list-decimal divide-y overflow-y-auto px-4 pl-8 text-sm md:flex-1">
                  {[
                    percent === null
                      ? `Check ${metricLabels[comparison.baseline].toLowerCase()} records for this month; no positive baseline is available.`
                      : variance < 0
                        ? `${metricLabels[comparison.measured]} is ${number.format(Math.abs(variance))} bags below ${metricLabels[comparison.baseline].toLowerCase()}. ${comparison.measured === 'forecast' ? 'Follow up on forecast submissions and approvals.' : 'Check sales updates and pending deliveries.'}`
                        : `${metricLabels[comparison.measured]} has reached ${formatPercent(percent)} of ${metricLabels[comparison.baseline].toLowerCase()}. ${comparison.measured === 'forecast' ? 'Confirm planned orders with customers.' : 'Confirm sales records are complete.'}`,
                    lowestAchievement && Number(lowestAchievement[comparison.measured]) < Number(lowestAchievement[comparison.baseline])
                      ? lowestPerformers.length > 1
                        ? `${highlightCount(lowestPerformers.length)} ${performanceLabel.plural} are tied at ${formatPercent(lowestPercent)} of ${metricLabels[comparison.baseline].toLowerCase()}: ${lowestPerformers.slice(0, 3).map((row) => row.region).join(', ')}${lowestPerformers.length > 3 ? `, and ${lowestPerformers.length - 3} others` : ''}. Review their gaps with the sales owners.`
                        : `Prioritize ${lowestAchievement.region} (${formatPercent(lowestPercent)} of ${metricLabels[comparison.baseline].toLowerCase()}). Review the gap with its sales owner.`
                      : null,
                    highestVolume && Number(highestVolume[comparison.measured]) > 0
                      ? `${highestVolume.region} leads with ${number.format(highestVolume[comparison.measured])} bags. Review its top customers and products for more opportunities.`
                      : 'No positive volume recorded. Check this month’s records.',
                  ].filter((text): text is string => Boolean(text)).map((text) => (
                    <li key={text} className="py-2.5 pl-1">{text}</li>
                  ))}
                </ol>}
              </section>
            </div>
          </div>

          <section aria-busy={detailsLoading} className={panel}>
            <div data-monthly-sales-header="" data-section-header="" data-aligned-toolbar="" className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5">
              <div>
                <h3 data-section-title="" className="text-sm font-semibold"><HeadingCalendarDays className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />Monthly Sales · {monthLabel}</h3>
              </div>
              <button data-slot="expand-collapse-button" data-action-tone="neutral" type="button" disabled={keys.length === 0}
                onClick={() => setExpanded(new Set(allExpanded ? [] : keys))}
                className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"><ExpandCollapseIcon expanded={allExpanded} />
                <span className="hidden md:inline">{allExpanded ? 'Collapse All' : 'Expand All'}</span>
              </button>
            </div>
            <SalesHierarchyTable showActions={false} showStatus={false} rows={monthlyHierarchyRows(salesGroups)} loading={detailsLoading}
              totalVolume={(data?.details ?? []).reduce((sum, item) => sum + (Number(item.volume) || 0), 0)}
              label="Monthly Sales table" emptyMessage={data?.detailsError || 'No approved forecasts for the selected month.'}
              summary={summaryForLevel(data?.details.length ?? 0, data?.showAsm ? 'asms' : data?.scope === 'kam' ? 'customers' : data?.scope === 'rsm' ? 'kams' : 'rsms', (data?.details ?? []).map(row => data?.showAsm ? row.asm_id : data?.scope === 'kam' ? row.customer_id : data?.scope === 'rsm' ? row.submitted_by : row.endorsed_by))} />

          </section>
        </>
      )}
    </div>
  )
}
