type ReferenceScope = { year: number; region_id: number | null; customer_id: number | null; product_id: number | null }

import type { createClient } from './client'

export async function loadSalesReferenceBudgets(client: ReturnType<typeof createClient>, forecasts: ReferenceScope[]) {
  const years = [...new Set(forecasts.map((row) => row.year))]
  const regions = [...new Set(forecasts.flatMap((row) => row.region_id === null ? [] : [row.region_id]))]
  const products = [...new Set(forecasts.flatMap((row) => row.product_id === null ? [] : [row.product_id]))]
  const customers = [...new Set(forecasts.flatMap((row) => row.customer_id === null ? [] : [row.customer_id]))]
  type Budget = { id: number; year: number; month: number | null; region_id: number | null; subregion_id: number | null; customer_id: number | null; product_id: number | null; volume: number }
  const records: Budget[] = []
  if (!years.length || !regions.length || !products.length) return { data: records, error: null }
  for (let from = 0; ; from += 1000) {
    let query = client.rpc('get_monthly_reference_budget_rows', {
      p_module: 'Approvals', p_years: years, p_region_ids: regions, p_customer_ids: customers,
    }).select('id, year, month, region_id, subregion_id, customer_id, product_id, volume')
      .in('year', years).in('region_id', regions).in('product_id', products).order('id').range(from, from + 999)
    query = customers.length ? query.or('customer_id.is.null,customer_id.in.(' + customers.join(',') + ')') : query.is('customer_id', null)
    const { data, error } = await query.abortSignal(AbortSignal.timeout(20000))
    if (error) return { data: null, error }
    const page = (data ?? []) as Budget[]
    records.push(...page)
    if (page.length < 1000) return { data: records, error: null }
  }
}
