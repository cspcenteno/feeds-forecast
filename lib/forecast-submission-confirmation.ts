import type { ConfirmationOptions } from './action-confirmation'

export function forecastSubmissionConfirmation(
  records: { customer_id: number | null; product_id: number | null; volume: number | null; year?: number; week?: number }[],
  scope: string,
  customerName: (id: number | null) => string,
  productName: (id: number | null) => string,
): ConfirmationOptions {
  const number = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 })
  const groups = new Map<string, { label: string; volume: number }>()
  for (const record of records) {
    const key = JSON.stringify([record.customer_id, record.product_id])
    const group = groups.get(key) ?? { label: `${customerName(record.customer_id)} — ${productName(record.product_id)}`, volume: 0 }
    group.volume += Number(record.volume) || 0
    groups.set(key, group)
  }
  return {
    layout: 'review', title: 'Submit Sales Forecasts', confirmLabel: `Submit (${records.length})`, tone: 'transfer',
    message: `${records.length} forecast record${records.length === 1 ? '' : 's'} ready for RSM review.`,
    forecastSummary: { records, scope, level: 'submit', customerName, productName },
    details: [
      { label: 'Action Scope', value: scope },
      { label: 'Customers', value: String(new Set(records.map((record) => record.customer_id)).size) },
      { label: 'Products', value: String(new Set(records.map((record) => record.product_id)).size) },
      { label: 'Total Volume (50kg)', value: number.format(records.reduce((sum, record) => sum + (Number(record.volume) || 0), 0)) },
    ],
    items: [...groups.values()].map((group) => ({ label: group.label, volume: number.format(group.volume) })),
  }
}
