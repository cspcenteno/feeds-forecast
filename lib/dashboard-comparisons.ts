export type RegionalVolumes = { region: string; budget: number; forecast: number; actual: number }
export type VolumeMetric = 'budget' | 'forecast' | 'actual'

export const dashboardComparisons = [
  { id: 'forecast-budget', title: 'Budget vs Forecast', baseline: 'budget', measured: 'forecast' },
  { id: 'budget-actual', title: 'Actual vs Budget', baseline: 'budget', measured: 'actual' },
  { id: 'forecast-actual', title: 'Forecast vs Actual', baseline: 'forecast', measured: 'actual' },
] as const

export const metricLabels = { budget: 'Budget', forecast: 'Forecast', actual: 'Actual' }
export const metricColors = { budget: 'var(--dashboard-budget)', forecast: 'var(--dashboard-forecast)', actual: 'var(--dashboard-actual)' }

export function actualInDashboardScope(
  row: { region_id: number | null; subregion_id: number | null; customer_id: number | null; product_id: number | null },
  viewer: { scope: string; regionId: number | null; subregionId: number | null; isSupervisor: boolean },
  kamKeys: Set<string>,
) {
  if (viewer.isSupervisor) return viewer.regionId !== null && row.region_id === viewer.regionId
  if (viewer.scope === 'global') return true
  if (viewer.scope === 'kam') return kamKeys.has(JSON.stringify([row.region_id, row.customer_id, row.product_id]))
  return (viewer.scope === 'asm' || viewer.scope === 'rsm') && viewer.regionId !== null && row.region_id === viewer.regionId
}

export function compareVolumes(baseline: number, measured: number) {
  return { variance: measured - baseline, percent: baseline > 0 ? measured / baseline * 100 : null }
}

export function mergeRegionalActuals(
  regions: { region: string; budget: number; forecast: number }[],
  actuals: { region: string; actual: number }[],
): RegionalVolumes[] {
  const merged = new Map<string, RegionalVolumes>()
  for (const row of regions) merged.set(row.region, { ...row, budget: Number(row.budget), forecast: Number(row.forecast), actual: 0 })
  for (const row of actuals) {
    const existing = merged.get(row.region) ?? { region: row.region, budget: 0, forecast: 0, actual: 0 }
    existing.actual += Number(row.actual)
    merged.set(row.region, existing)
  }
  return [...merged.values()].sort((a, b) => a.region.localeCompare(b.region))
}
