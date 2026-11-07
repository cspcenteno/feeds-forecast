import type { createClient } from '@/lib/client'

type ActualRow = {
  actual_date: string
  region_id: number
  category_id: number
  product_id: number
  customer_id: number
  volume: number
}

export function getActualPeriod(date: string) {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) }
}

export type ActualRecord = ActualRow & ReturnType<typeof getActualPeriod>

export async function loadActualRecords(
  supabase: ReturnType<typeof createClient>,
  years: number[],
  scope?: { regionId: number; customerId: number }
) {
  const pageSize = 1000
  const records: ActualRecord[] = []

  for (const year of new Set(years)) {
    for (let from = 0; ; from += pageSize) {
      let query = supabase.from('actuals')
        .select('actual_date, region_id, category_id, product_id, customer_id, volume')
        .gte('actual_date', year + '-01-01')
        .lt('actual_date', (year + 1) + '-01-01')
        .order('actual_date')
        .order('id')
        .range(from, from + pageSize - 1)

      if (scope) {
        query = query.eq('region_id', scope.regionId).eq('customer_id', scope.customerId)
      }

      const { data, error } = await query
      if (error) return { data: null, error }

      records.push(...data.map((row: ActualRow) => ({ ...row, ...getActualPeriod(row.actual_date) })))
      if (data.length < pageSize) break
    }
  }

  return { data: records, error: null }
}
