import { monthlyReferenceKey, type MonthlyReference } from '@/lib/sales-monthly-references'
import type { DashboardMonthlyReferences } from './dashboard-sales-totals'

export type DashboardReferenceKey = {
  id: number; region_id: number | null; subregion_id: number | null
  submitted_by: string | null; endorsed_by: string | null
  customer_id: number | null; product_id: number | null
}

export const dashboardReferenceRowKey = (row: Omit<DashboardReferenceKey, 'id'>) => JSON.stringify([
  row.region_id, row.subregion_id, row.submitted_by, row.endorsed_by, row.customer_id, row.product_id,
])

export function dashboardMonthlyReferences(anchor: DashboardReferenceKey, references: Map<string, MonthlyReference>): DashboardMonthlyReferences {
  const result: DashboardMonthlyReferences = {}
  for (const level of ['asm', 'rsm', 'kam', 'customer', 'product'] as const) {
    const reference = references.get(monthlyReferenceKey(anchor.id, level))
    if (!reference) continue
    const dimensions = level === 'asm' ? [anchor.region_id]
      : level === 'rsm' ? [anchor.region_id, anchor.endorsed_by ?? anchor.subregion_id]
        : level === 'kam' ? [anchor.region_id, anchor.subregion_id, anchor.submitted_by]
          : [anchor.region_id, anchor.subregion_id, anchor.customer_id, ...(level === 'product' ? [anchor.product_id] : [])]
    result[level] = {
      scope_key: JSON.stringify([level, ...dimensions]), budget: Number(reference.budget_volume),
      actual: Number(reference.actual_volume), previous_actual: Number(reference.previous_actual_volume),
      forecast: Number(reference.forecast_volume),
    }
  }
  return result
}
