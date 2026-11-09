import type { createClient } from './client'

export function saveForecastDrafts(client: ReturnType<typeof createClient>, rows: Record<string, unknown>[]) {
  // Mixed batches contain IDs only for edited rows. New rows must use the
  // database's generated ID rather than PostgREST's default missing = null.
  return client.from('sales_forecasts').upsert(rows, {
    onConflict: 'id',
    defaultToNull: false,
  })
}
