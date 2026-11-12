export type DashboardReferenceRow = {
  region_id: number | null; customer_id: number | null; product_id: number | null; budget_id: number | null
  quantity: number; volume: number; budget: number; actual: number; prior_actual: number
  customer_budget?: number; customer_actual?: number; customer_prior_actual?: number; customer_forecast?: number
}

export function dashboardSalesTotals(rows: DashboardReferenceRow[], customerLevel: boolean) {
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
