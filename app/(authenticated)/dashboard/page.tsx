'use client'

import Image from 'next/image'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Table } from '@/components/ui/table'
import { compareVolumes, dashboardComparisons, metricColors, metricLabels, type RegionalVolumes } from '@/lib/dashboard-comparisons'
import type { DashboardLevel } from '@/lib/dashboard-performance'

type RegionVolume = RegionalVolumes & { key?: string }

type SalesDetail = {
  region_id: number | null
  subregion_id: number | null
  customer_id: number | null
  product_id: number | null
  budget_id: number | null
  endorsed_by: string | null
  submitted_by: string | null
  region: string
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
}

type DashboardData = {
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

const number = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 })

function achievement(forecast: number, budget: number) {
  return budget > 0 ? forecast / budget * 100 : null
}

function formatPercent(value: number | null) {
  return value === null ? '—' : number.format(value) + '%'
}

function volumeTotals(rows: SalesDetail[]) {
  const budgets = new Map<number, number>()
  const actuals = new Map<string, SalesDetail>()
  let quantity = 0
  let volume = 0

  for (const row of rows) {
    quantity += Number(row.quantity)
    volume += Number(row.volume)
    if (row.budget_id !== null) budgets.set(row.budget_id, Number(row.budget))
    actuals.set(JSON.stringify([row.region_id, row.customer_id, row.product_id]), row)
  }

  let actual = 0
  let priorActual = 0
  for (const row of actuals.values()) {
    actual += Number(row.actual)
    priorActual += Number(row.prior_actual)
  }

  return [quantity, volume, [...budgets.values()].reduce((sum, budget) => sum + budget, 0), actual, priorActual, volume]
}

function buildSalesGroups(data: DashboardData) {
  const levels: ((row: SalesDetail) => [string | number | null, string])[] = []
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
      return {
        key,
        label: entry.label,
        area: [...new Set(entry.rows.map((row) => [row.region, row.subregion].filter(Boolean).join(' - ')))].join(', '),
        metrics: volumeTotals(entry.rows),
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
  company: { title: 'Area volume performance', column: 'Area', by: 'Area', plural: 'areas' },
  region: { title: 'Regional volume performance', column: 'Region', by: 'Region', plural: 'regions' },
  subregion: { title: 'Subregional volume performance', column: 'Subregion', by: 'Subregion', plural: 'subregions' },
  'customer-product': { title: 'Customer / Product volume performance', column: 'Customer / Product', by: 'Customer / Product', plural: 'customer / product groups' },
}
const shortLabel = (value: string) => value.length > 26 ? value.slice(0, 25) + '…' : value

export default function DashboardPage() {
  const [month, setMonth] = useState(() => new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric', month: '2-digit', timeZone: 'Asia/Manila',
  }).format(new Date()))
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ month: string; revision: number; data: DashboardData | null; error: string } | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [comparisonId, setComparisonId] = useState<(typeof dashboardComparisons)[number]['id']>('forecast-budget')
  const comparison = dashboardComparisons.find((item) => item.id === comparisonId)!

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch('/api/dashboard?month=' + encodeURIComponent(month), { signal: controller.signal, cache: 'no-store' })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error ?? 'Unable to load dashboard data.')
        const data = body as DashboardData
        if (controller.signal.aborted) return
        setResult({
          month, revision, data: data as DashboardData | null,
          error: data ? '' : 'Dashboard data is unavailable for this account.',
        })
      } catch (error) {
        if (controller.signal.aborted) return
        setResult({ month, revision, data: null, error: error instanceof Error ? error.message : 'Unable to load dashboard data.' })
      }
    }
    void load()
    return () => controller.abort()
  }, [month, revision])

  const current = result?.month === month && result.revision === revision ? result : null
  const data = current?.data
  const regions = data?.performance.rows ?? []
  const performanceLevel = data?.performance.level ?? 'company'
  const performanceLabel = performanceLabels[performanceLevel]
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
  const chartRows = regions.map((row) => ({
    key: row.key ?? row.region,
    region: row.region,
    budget: Number(row.budget),
    forecast: Number(row.forecast),
    actual: Number(row.actual),
    variance: Number(row[comparison.measured]) - Number(row[comparison.baseline]),
  }))
  const contributionRows = chartRows.filter((row) => row[comparison.measured] > 0)
    .map((row, index) => ({ ...row, fill: regionColors[index % regionColors.length] }))
  const contributionTotal = contributionRows.reduce((sum, row) => sum + row[comparison.measured], 0)
  const baselineContributionRows = chartRows.filter((row) => row[comparison.baseline] > 0)
    .map((row, index) => ({ ...row, fill: regionColors[index % regionColors.length] }))
  const baselineContributionTotal = baselineContributionRows.reduce((sum, row) => sum + row[comparison.baseline], 0)
  const salesGroups = useMemo(() => data ? buildSalesGroups(data) : [], [data])
  const keys = groupKeys(salesGroups)
  const allExpanded = keys.length > 0 && keys.every((key) => expanded.has(key))

  function renderSalesGroup(group: SalesGroup, depth: number): React.ReactNode {
    const isGroup = group.children.length > 0
    const isExpanded = expanded.has(group.key)
    return (
      <Fragment key={group.key}>
        <tr className={isGroup ? 'border-b bg-emerald-50/70 font-semibold dark:border-slate-700 dark:bg-emerald-950/35 dark:text-emerald-100' : 'border-b hover:bg-sky-50/50 dark:border-slate-700 dark:hover:bg-slate-800'}>
          <td className="px-3 py-2">
            {isGroup ? (
              <button
                type="button"
                aria-expanded={isExpanded}
                className="flex items-start gap-2 text-left hover:text-primary"
                style={{ paddingInlineStart: depth * 16 }}
                onClick={() => setExpanded((previous) => {
                  const next = new Set(previous)
                  if (next.has(group.key)) next.delete(group.key)
                  else next.add(group.key)
                  return next
                })}
              >
                {isExpanded ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                <span className="wrap-anywhere">{group.label}</span>
              </button>
            ) : <div className="wrap-anywhere text-xs" style={{ paddingInlineStart: depth * 16 + 24 }}>{group.label}</div>}
          </td>
          <td className="px-3 py-2 wrap-anywhere">{group.area}</td>
          {group.metrics.map((value, index) => <td key={index} className="px-3 py-2 text-right tabular-nums">{number.format(value)}</td>)}
        </tr>
        {isExpanded && group.children.map((child) => renderSalesGroup(child, depth + 1))}
      </Fragment>
    )
  }

  return (
    <div className="sales-dashboard space-y-4 rounded-xl bg-slate-100/70 p-3 dark:bg-slate-950 dark:text-slate-100">
      <header className="rounded-lg border border-t-4 border-t-emerald-500 bg-card px-4 py-3 shadow-sm dark:border-slate-600 dark:border-t-emerald-400 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <Image src="/vitarich-logo.png" alt="Vitarich" width={36} height={36} className="size-9 shrink-0 object-contain" />
            <h2 className="text-lg leading-tight font-semibold sm:text-xl">Sales Performance Dashboard</h2>
          </div>
          <div className="flex max-w-full items-center gap-2">
            <input aria-label="Month" type="month" value={month} onChange={(event) => {
              if (!event.target.value) return
              setMonth(event.target.value)
              setExpanded(new Set())
            }} className="h-9 min-w-0 rounded-sm border bg-background px-2 text-sm" />
            <button type="button" onClick={() => setRevision((value) => value + 1)} disabled={!current}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-sm border bg-background px-3 text-sm hover:bg-muted disabled:opacity-50">
              <RefreshCw className="size-4" /> Refresh
            </button>
          </div>
        </div>
      </header>

      {!current ? (
        <p role="status" className="rounded-sm border bg-card p-6 text-sm text-muted-foreground">Loading monthly sales…</p>
      ) : current.error ? (
        <p role="alert" className="rounded-sm border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{current.error}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { metric: 'budget' as const, label: 'Budget volume', value: number.format(totals.budget), unit: 'bags' },
              { metric: 'forecast' as const, label: 'Forecast volume', value: number.format(totals.forecast), unit: 'bags' },
              { metric: 'actual' as const, label: 'Actual volume', value: number.format(totals.actual), unit: 'bags' },
            ].map(({ metric, label, value, unit }) => (
              <div key={label} className={`rounded-lg border border-t-4 px-4 py-4 shadow-sm ${metricAppearance[metric]}`}>
                <p className="text-sm font-semibold">{label}</p>
                <p className="mt-2 text-3xl leading-tight font-bold tabular-nums">{value}</p>
                <p className="mt-1 text-xs font-medium">{unit} · {monthLabel}</p>
                {metric === 'actual' && data?.actualRecordCount === 0 && <p className="mt-1 text-xs">No Actual records for this month.</p>}
              </div>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-3" role="group" aria-label="Sales comparison">
            {dashboardComparisons.map((item) => {
              const values = compareVolumes(totals[item.baseline], totals[item.measured])
              const active = comparisonId === item.id
              return <button key={item.id} type="button" aria-pressed={active} aria-controls="dashboard-comparison-results" onClick={() => setComparisonId(item.id)}
                className={`cursor-pointer rounded-lg border px-3 py-2 text-left shadow-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${active ? comparisonAppearance[item.id] : 'border-slate-300 bg-card hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800'}`}>
                <span className="flex items-center justify-between gap-2 text-sm font-semibold">{item.title}{active && <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />}</span>
                <span className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xl font-semibold tabular-nums">{formatPercent(values.percent)}</span>
                  <span className={`text-sm font-semibold tabular-nums ${active ? 'text-white' : values.variance < 0 ? 'text-rose-700 dark:text-rose-300' : values.variance > 0 ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>{values.variance > 0 ? '+' : ''}{number.format(values.variance)} bags</span>
                </span>
              </button>
            })}
          </div>

          <div id="dashboard-comparison-results" className="grid gap-3 xl:grid-cols-2">
            <div className="contents">
              <section className={panel + ' order-1 flex flex-col'}>
                <h3 className={panelTitle}>{performanceLabel.title} · {monthLabel}</h3>
                <Table containerProps={{ className: 'max-h-[22rem] overflow-x-hidden overflow-y-auto' }} className="table-fixed text-xs">
                  <colgroup><col className="w-[22%]" /><col className="w-[15%]" /><col className="w-[15%]" /><col className="w-[15%]" /><col className="w-[17%]" /><col className="w-[16%]" /></colgroup>
                  <thead className="sticky top-0 z-10 bg-card text-muted-foreground">
                    <tr>{[performanceLabel.column, 'Budget', 'Forecast', 'Actual', 'Variance', '% of ' + metricLabels[comparison.baseline]].map((label, index) =>
                      <th key={label} scope="col" className={'px-1.5 py-3 wrap-anywhere sm:px-2 ' + (index === 0 ? 'text-left' : 'text-right')}>{label}</th>
                    )}</tr>
                  </thead>
                  <tbody>
                    {regions.map((row) => {
                      const difference = Number(row[comparison.measured]) - Number(row[comparison.baseline])
                      return <tr key={row.key ?? row.region} className="border-b even:bg-muted/25">
                        <th scope="row" className="px-1.5 py-2 text-left font-medium wrap-anywhere sm:px-2">{row.region}</th>
                        <td className="px-1.5 py-2 text-right tabular-nums wrap-anywhere sm:px-2">{number.format(row.budget)}</td>
                        <td className="px-1.5 py-2 text-right tabular-nums wrap-anywhere sm:px-2">{number.format(row.forecast)}</td>
                        <td className="px-1.5 py-2 text-right tabular-nums wrap-anywhere sm:px-2">{number.format(row.actual)}</td>
                        <td className={'px-1.5 py-2 text-right tabular-nums wrap-anywhere sm:px-2 ' + (difference < 0 ? 'text-red-700 dark:text-red-400' : '')}>{number.format(difference)}</td>
                        <td className="px-1.5 py-2 text-right tabular-nums wrap-anywhere sm:px-2">{formatPercent(achievement(row[comparison.measured], row[comparison.baseline]))}</td>
                      </tr>
                    })}
                    {regions.length === 0 && <tr><td colSpan={6} className="px-3 py-3 text-center text-muted-foreground">No volume recorded for this month.</td></tr>}
                  </tbody>
                  <tfoot className="sticky bottom-0 border-t-2 bg-card font-semibold">
                    <tr><th scope="row" className="px-1.5 py-2 text-left wrap-anywhere sm:px-2">Grand total</th>
                      {[totals.budget, totals.forecast, totals.actual, variance].map((value, index) => <td key={index} className="px-1.5 py-2 text-right tabular-nums wrap-anywhere sm:px-2">{number.format(value)}</td>)}
                      <td className="px-1.5 py-2 text-right tabular-nums wrap-anywhere sm:px-2">{formatPercent(percent)}</td>
                    </tr>
                  </tfoot>
                </Table>
              </section>

              <section className={panel + ' order-3 flex h-[22rem] flex-col'}>
                <h3 className={panelTitle}>{comparison.title} by {performanceLabel.by} (bags)</h3>
                {chartRows.length ? (
                  <div className="min-h-0 flex-1 px-2 py-3 text-xs">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartRows} accessibilityLayer>
                        <CartesianGrid vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="region" tickLine={false} tickFormatter={shortLabel} />
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
              <section className={panel + ' order-2 flex min-h-64 flex-col'}>
                <h3 className={panelTitle}>{metricLabels[comparison.baseline]} Volume Contribution by {performanceLabel.by}</h3>
                {baselineContributionRows.length ? (
                  <div className="grid min-h-0 flex-1 items-center gap-3 p-3 sm:grid-cols-2">
                    <div className="relative h-32 min-w-0 text-xs sm:h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart accessibilityLayer>
                          <Pie data={baselineContributionRows} dataKey={comparison.baseline} nameKey="region" innerRadius="62%" outerRadius="92%" stroke="var(--card)" isAnimationActive={false} />
                          <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'var(--popover-foreground)' }} formatter={(value) => number.format(Number(value)) + ' bags'} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 grid place-content-center text-center" aria-hidden="true">
                        <span className="text-lg font-semibold tabular-nums">{number.format(baselineContributionTotal)}</span><span className="text-xs text-muted-foreground">bags</span>
                      </div>
                    </div>
                    <ul className="max-h-24 space-y-2 overflow-y-auto pr-1 text-xs sm:max-h-60">
                      {baselineContributionRows.map((row) => <li key={row.key} className="flex items-center gap-2">
                        <span className="size-2.5 shrink-0" style={{ backgroundColor: row.fill }} aria-hidden="true" />
                        <span className="min-w-0 flex-1 wrap-anywhere">{row.region}</span>
                        <span className="tabular-nums">{number.format(row[comparison.baseline])}</span>
                        <span className="w-10 text-right tabular-nums text-muted-foreground">{formatPercent(row[comparison.baseline] / baselineContributionTotal * 100)}</span>
                      </li>)}
                    </ul>
                  </div>
                ) : <p className="p-4 text-sm text-muted-foreground">No positive {metricLabels[comparison.baseline].toLowerCase()} volume for this month.</p>}
                {chartRows.some((row) => row[comparison.baseline] < 0) && <p className="px-3 pb-3 text-xs text-muted-foreground">Shares use positive volumes. Negative volumes remain in totals and comparisons.</p>}
              </section>

              <section className={panel + ' order-5 flex flex-col xl:col-span-2'}>
                <h3 className={panelTitle}>{metricLabels[comparison.measured]} Contribution by {performanceLabel.by}</h3>
                {contributionRows.length ? (
                  <div className="grid items-center gap-3 p-3 sm:grid-cols-2">
                    <div className="relative h-32 min-w-0 text-xs sm:h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart accessibilityLayer>
                          <Pie data={contributionRows} dataKey={comparison.measured} nameKey="region"
                            innerRadius="62%" outerRadius="92%" stroke="var(--card)" isAnimationActive={false} />
                          <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'var(--popover-foreground)' }}
                            formatter={(value) => number.format(Number(value)) + ' bags'} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 grid place-content-center text-center" aria-hidden="true">
                        <span className="text-lg font-semibold tabular-nums">{number.format(contributionTotal)}</span>
                        <span className="text-xs text-muted-foreground">bags</span>
                      </div>
                    </div>
                    <ul className="space-y-2 pr-1 text-xs">
                      {contributionRows.map((row) => (
                        <li key={row.key} className="flex items-center gap-2">
                          <span className="size-2.5 shrink-0" style={{ backgroundColor: row.fill }} aria-hidden="true" />
                          <span className="min-w-0 flex-1 wrap-anywhere">{row.region}</span>
                          <span className="tabular-nums">{number.format(row[comparison.measured])}</span>
                          <span className="w-10 text-right tabular-nums text-muted-foreground">{formatPercent(row[comparison.measured] / contributionTotal * 100)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : <p className="p-4 text-sm text-muted-foreground">No positive {metricLabels[comparison.measured].toLowerCase()} volume for this month.</p>}
                {chartRows.some((row) => row[comparison.measured] < 0) && <p className="px-3 pb-3 text-xs text-muted-foreground">Contribution shares use positive volumes. Negative volumes are included in totals and comparisons.</p>}
              </section>

              <section className={panel + ' order-4 flex h-[22rem] flex-col'}>
                <h3 className={panelTitle}>Monthly highlights</h3>
                <ol className="min-h-0 flex-1 list-decimal divide-y overflow-y-auto px-4 pl-8 text-sm">
                  {[
                    percent === null ? 'No positive ' + metricLabels[comparison.baseline].toLowerCase() + ' is available for this comparison.' : metricLabels[comparison.measured] + ' is ' + formatPercent(percent) + ' of ' + metricLabels[comparison.baseline].toLowerCase() + ', a variance of ' + number.format(variance) + ' bags.',
                    highestVolume && Number(highestVolume[comparison.measured]) > 0 ? highestVolume.region + ' contributes the most ' + metricLabels[comparison.measured].toLowerCase() + ' volume at ' + number.format(highestVolume[comparison.measured]) + ' bags.' : null,
                    lowestAchievement ? lowestAchievement.region + ' has the lowest ' + metricLabels[comparison.measured].toLowerCase() + '-to-' + metricLabels[comparison.baseline].toLowerCase() + ' ratio at ' + formatPercent(achievement(lowestAchievement[comparison.measured], lowestAchievement[comparison.baseline])) + '.' : null,
                  ].filter((text): text is string => Boolean(text)).map((text) => (
                    <li key={text} className="py-2.5 pl-1">{text}</li>
                  ))}
                </ol>
              </section>
            </div>
          </div>

          <section className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5">
              <div>
                <h3 className="text-sm font-semibold">Monthly Sales · {monthLabel}</h3>
              </div>
              <button type="button" disabled={keys.length === 0}
                onClick={() => setExpanded(new Set(allExpanded ? [] : keys))}
                className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50">
                {allExpanded ? 'Collapse All' : 'Expand All'}
              </button>
            </div>
            <Table saved className="table-fixed" containerProps={{ className: 'max-h-[min(32rem,65vh)] overflow-auto', tabIndex: 0, role: 'region', 'aria-label': 'Monthly Sales table' }}>
              <colgroup><col className="w-[24%]" /><col className="w-[16%]" /><col /><col /><col /><col /><col /><col /></colgroup>
              <thead className="sticky top-0 bg-card">
                <tr className="border-b bg-muted/40">
                  {['Sales structure', 'Area', 'Forecast (Qty.)', 'Volume (50kg)', 'Budget (Vol.)', 'Actual (Vol.)', 'Actual (Last Year Vol.)', 'Forecast (Vol.)'].map((label, index) =>
                    <th key={label} scope="col" className={'px-3 py-3 font-medium ' + (index < 2 ? 'text-left' : 'text-right')}>{label}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {salesGroups.length ? salesGroups.map((group) => renderSalesGroup(group, 0)) : (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No approved forecasts for this month.</td></tr>
                )}
              </tbody>
            </Table>
          </section>
        </>
      )}
    </div>
  )
}
