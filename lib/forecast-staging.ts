import type { createClient } from '@/lib/client'
import type { ForecastImportRow } from './forecast-import'

type Client = ReturnType<typeof createClient>
const fields = ['year', 'week', 'region', 'subregion', 'customer', 'product_code', 'product_name', 'kam', 'forecast', 'volume'] as const

export function toForecastStagingValues(row: ForecastImportRow) {
  return Object.fromEntries(fields.map((field) => [field, row[field]?.trim() || null]))
}

export function fromForecastStagingRow(row: Record<string, unknown>): ForecastImportRow {
  return {
    id: String(row.id),
    ...Object.fromEntries(fields.map((field) => [field, String(row[field] ?? '')])),
  } as ForecastImportRow
}

export async function loadForecastStaging(client: Client, onProgress?: (rows: ForecastImportRow[]) => void) {
  const records: ForecastImportRow[] = []
  let lastId: string | null = null
  while (true) {
    const query = client.from('forecast_import_staging').select(['id', ...fields].join(',')).order('id').limit(500)
    if (lastId !== null) query.gt('id', lastId)
    const { data, error } = await query.abortSignal(AbortSignal.timeout(45000))
    if (error) throw new Error(`Unable to load Forecast staging: ${error.message}`)
    const page = (data ?? []) as unknown as Record<string, unknown>[]
    records.push(...page.map(fromForecastStagingRow))
    onProgress?.([...records])
    if (page.length < 500) return records
    lastId = String(page[page.length - 1].id)
  }
}

export async function updateForecastStaging(client: Client, row: ForecastImportRow) {
  const { data, error } = await client.from('forecast_import_staging')
    .update(toForecastStagingValues(row)).eq('id', row.id).select('id').maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('The uploaded row is unavailable or you lack permission to edit it.')
}

export async function deleteForecastStaging(client: Client, ids: string[]) {
  let deleted = 0
  for (let start = 0; start < ids.length; start += 250) {
    const batch = ids.slice(start, start + 250)
    const { data, error } = await client.from('forecast_import_staging').delete().in('id', batch).select('id')
    if (error) throw new Error(`Discard stopped after ${deleted} row(s): ${error.message}`)
    deleted += data?.length ?? 0
    if (data?.length !== batch.length) throw new Error(`Only ${deleted} uploaded row(s) could be discarded. Refresh staging to check permissions or concurrent changes.`)
  }
}
