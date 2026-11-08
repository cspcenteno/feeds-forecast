type Budget = {
  year: number; month: number | null; region_id: number | null; subregion_id: number | null
  customer_id: number | null; product_id: number | null; volume: number | null
}

export function monthlyBudgetReference(budgets: Budget[], year: number, month: number, region: number | null,
  subregion: number | null, customer: number | null, product: number | null) {
  if (region === null || product === null) return 0
  const matching = budgets.filter((row) => row.year === year && row.region_id === region && row.product_id === product
    && (row.month === month || row.month === null)
    && (row.customer_id === customer || row.customer_id === null)
    && (subregion === null || row.subregion_id === subregion || row.subregion_id === null))
  const customerRows = matching.some((row) => row.customer_id === customer)
    ? matching.filter((row) => row.customer_id === customer) : matching.filter((row) => row.customer_id === null)
  // A region-only forecast can reference detailed imported subregions. Generic
  // regional totals are fallbacks, not extra volume to add over those details.
  const scoped = subregion === null
    ? customerRows.some((row) => row.subregion_id !== null) ? customerRows.filter((row) => row.subregion_id !== null) : customerRows
    : customerRows.some((row) => row.subregion_id === subregion) ? customerRows.filter((row) => row.subregion_id === subregion) : customerRows
  const scopes = new Map<number | null, Budget[]>()
  for (const row of scoped) {
    const rows = scopes.get(row.subregion_id) ?? []
    rows.push(row)
    scopes.set(row.subregion_id, rows)
  }
  let total = 0
  for (const rows of scopes.values()) {
    const monthly = rows.filter((row) => row.month === month)
    total += (monthly.length ? monthly : rows).reduce((sum, row) => sum + (Number(row.volume) || 0), 0) / (monthly.length ? 1 : 12)
  }
  return total
}

export function customerMonthlyBudgetReference(budgets: Budget[], year: number, month: number,
  region: number | null, subregion: number | null, customer: number | null) {
  if (region === null || customer === null) return 0
  const products = new Map<number, Budget[]>()
  for (const row of budgets) {
    if (row.region_id !== region || row.customer_id !== customer || row.year !== year
      || (row.month !== month && row.month !== null) || row.product_id === null) continue
    const rows = products.get(row.product_id) ?? []
    rows.push(row)
    products.set(row.product_id, rows)
  }
  return [...products].reduce((total, [product, rows]) =>
    total + monthlyBudgetReference(rows, year, month, region, subregion, customer, product), 0)
}
