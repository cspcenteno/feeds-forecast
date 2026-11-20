import type { MonthlyReference } from './sales-monthly-references'

export type DashboardMonthlyReferences = Partial<Record<MonthlyReference['team_level'], {
  scope_key: string; budget: number; actual: number; previous_actual: number; forecast: number
}>>

export type DashboardReferenceRow = {
  region_id: number | null; customer_id: number | null; product_id: number | null; budget_id: number | null
  quantity: number; volume: number; budget: number; actual: number; prior_actual: number
  customer_budget?: number; customer_actual?: number; customer_prior_actual?: number; customer_forecast?: number
  monthly_references?: DashboardMonthlyReferences
}

export function dashboardSalesTotals(rows: DashboardReferenceRow[], customerLevel: boolean, referenceLevel?: MonthlyReference['team_level']) {
  if (referenceLevel) {
    const quantity = rows.reduce((total, row) => total + Number(row.quantity), 0)
    const volume = rows.reduce((total, row) => total + Number(row.volume), 0)
    const references = new Map<string, NonNullable<DashboardMonthlyReferences['kam']>>()
    for (const row of rows) {
      const reference = row.monthly_references?.[referenceLevel]
      if (!reference) return [quantity, volume, NaN, NaN, NaN, NaN]
      references.set(reference.scope_key, reference)
    }
    const totals = [...references.values()]
    return [quantity, volume, ...(['budget', 'actual', 'previous_actual', 'forecast'] as const)
      .map((field) => totals.reduce((sum, row) => sum + Number(row[field]), 0))]
  }
  const fullCustomer = customerLevel && rows.every((row) => row.customer_budget !== undefined)
  const budgets = new Map<number, number>()
  const references = new Map<string, DashboardReferenceRow>()
  for (const row of rows) {
    if (row.budget_id !== null) budgets.set(row.budget_id, Number(row.budget))
    references.set(JSON.stringify([row.region_id, row.customer_id, ...(fullCustomer ? [] : [row.product_id])]), row)
  }
  const volume = rows.reduce((total, row) => total + Number(row.volume), 0)
  const quantity = rows.reduce((total, row) => total + Number(row.quantity), 0)
  const totals = [...references.values()]
  return [quantity, volume,
    fullCustomer ? totals.reduce((sum, row) => sum + Number(row.customer_budget), 0) : [...budgets.values()].reduce((sum, value) => sum + value, 0),
    totals.reduce((sum, row) => sum + Number(fullCustomer ? row.customer_actual : row.actual), 0),
    totals.reduce((sum, row) => sum + Number(fullCustomer ? row.customer_prior_actual : row.prior_actual), 0),
    fullCustomer ? totals.reduce((sum, row) => sum + Number(row.customer_forecast), 0) : volume,
  ]
}
