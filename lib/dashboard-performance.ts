export type DashboardLevel = 'company' | 'region' | 'subregion' | 'customer'
type Dimension = { region_id: number | null; subregion_id: number | null; customer_id: number | null; product_id: number | null }
type Volume = Dimension & { volume: number }
type Budget = Volume & { id: number; month: number | null }
type Labels = { regions: Map<number, string>; subregions: Map<number, string>; customers: Map<number, string>; products: Map<number, string> }

export function dashboardLevel(profile: { role: string; position: string | null }): DashboardLevel {
  const position = (profile.position ?? '').trim().toUpperCase()
  if (position === 'ASM') return 'region'
  if (['RSM', 'SV', 'SUPERVISOR'].includes(position)) return 'subregion'
  if (position === 'KAM' || profile.role === 'User') return 'customer'
  return 'company'
}

export function buildDashboardPerformance(
  level: DashboardLevel, forecasts: Volume[], budgets: Budget[], actuals: Volume[], labels: Labels,
) {
  const groups = new Map<string, { key: string; region: string; budget: number; forecast: number; actual: number }>()
  function group(row: Dimension) {
    const key = JSON.stringify(level === 'company' || level === 'region' ? [row.region_id]
      : level === 'subregion' ? [row.region_id, row.subregion_id] : [row.region_id, row.customer_id])
    let entry = groups.get(key)
    if (!entry) {
      const name = level === 'company' || level === 'region' ? labels.regions.get(row.region_id!) ?? 'Unassigned region'
        : level === 'subregion' ? labels.subregions.get(row.subregion_id!) ?? 'Unassigned subregion'
          : labels.customers.get(row.customer_id!) ?? 'Unassigned customer'
      entry = { key, region: name, budget: 0, forecast: 0, actual: 0 }
      groups.set(key, entry)
    }
    return entry
  }
  for (const row of forecasts) group(row).forecast += Number(row.volume ?? 0)
  for (const row of actuals) group(row).actual += Number(row.volume ?? 0)

  // Prefer monthly budgets to annual fallbacks for each exact customer/product
  // scope, then avoid adding generic customer totals over detailed budgets.
  const scopes = new Map<string, Budget[]>()
  for (const row of budgets) {
    const key = JSON.stringify([row.region_id, row.subregion_id, row.customer_id, row.product_id])
    const rows = scopes.get(key) ?? []
    rows.push(row)
    scopes.set(key, rows)
  }
  const detailedScopes = new Set(budgets.filter((row) => row.customer_id !== null)
    .map((row) => JSON.stringify([row.region_id, row.subregion_id, row.product_id])))
  for (const rows of scopes.values()) {
    const first = rows[0]
    if (level !== 'customer' && first.customer_id === null && detailedScopes.has(JSON.stringify([first.region_id, first.subregion_id, first.product_id]))) continue
    const monthly = rows.filter((row) => row.month !== null)
    const value = monthly.length ? monthly.reduce((sum, row) => sum + Number(row.volume ?? 0), 0)
      : rows.reduce((sum, row) => sum + Number(row.volume ?? 0), 0) / 12
    group(first).budget += value
  }
  return [...groups.values()].sort((a, b) => a.region.localeCompare(b.region))
}
