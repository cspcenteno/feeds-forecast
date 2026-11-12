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
  scope?: { regionId: number; customerId: number } | { regionIds: number[]; customerIds: number[] },
  referenceModule?: 'Forecasts' | 'Approvals',
) {
  const pageSize = 1000
  const records: ActualRecord[] = []
  if (scope && 'regionIds' in scope && (!scope.regionIds.length || !scope.customerIds.length)) {
    return { data: records, error: null }
  }

  for (const year of new Set(years)) {
    for (let from = 0; ; from += pageSize) {
      let query = (referenceModule
        ? supabase.rpc('get_monthly_reference_actual_rows', {
          p_module: referenceModule, p_year: year,
          p_region_ids: scope ? ('regionIds' in scope ? scope.regionIds : [scope.regionId]) : null,
          p_customer_ids: scope ? ('customerIds' in scope ? scope.customerIds : [scope.customerId]) : null,
        })
        : supabase.from('actuals'))
        .select('id, actual_date, region_id, category_id, product_id, customer_id, volume')
        .gte('actual_date', year + '-01-01')
        .lt('actual_date', (year + 1) + '-01-01')
        .order('actual_date')
        .order('id')
        .range(from, from + pageSize - 1)

      if (scope && 'regionIds' in scope) {
        query = query.in('region_id', scope.regionIds).in('customer_id', scope.customerIds)
      } else if (scope) {
        query = query.eq('region_id', scope.regionId).eq('customer_id', scope.customerId)
      }

      const { data, error } = await query
      if (error) return { data: null, error }

      const page = (data ?? []) as ActualRow[]
      records.push(...page.map((row) => ({ ...row, ...getActualPeriod(row.actual_date) })))
      if (page.length < pageSize) break
    }
  }

  return { data: records, error: null }
}
