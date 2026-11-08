import type { createClient } from './client'

type Snapshot = {
  id: number
  volume: number
  region_id: number | null
  subregion_id: number | null
  customer_id: number | null
  product_id: number | null
  category_id: number | null
  asm: string | null
  rsm: string | null
  kam: string | null
  year: number
  month: number | null
  actual_date?: string
}

export function validateSavedVolumePeriod(volume: string, isActual: boolean, year: string, month: string, date: string) {
  if (!volume.trim() || !Number.isFinite(Number(volume)) || Number(volume) < 0) {
    throw new Error('Enter a valid volume of zero or more.')
  }
  if (isActual) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
      throw new Error('Enter a valid Actual date.')
    }
  } else if (!Number.isInteger(Number(year)) || Number(year) < 2020 || Number(year) > 2100 ||
    (month !== '' && (!Number.isInteger(Number(month)) || Number(month) < 1 || Number(month) > 12))) {
    throw new Error('Enter a year from 2020 to 2100 and a valid month, or Annual.')
  }
}

export async function persistSavedVolumeUpdate(
  client: Pick<ReturnType<typeof createClient>, 'from'>,
  table: 'budgets' | 'actuals',
  original: Snapshot,
  payload: Record<string, string | number | null>,
) {
  let query = client.from(table).update(payload).eq('id', original.id).eq('volume', original.volume)
  for (const [field, value] of Object.entries({
    region_id: original.region_id, subregion_id: original.subregion_id,
    customer_id: original.customer_id, product_id: original.product_id,
    category_id: original.category_id,
    asm: original.asm, rsm: original.rsm, kam: original.kam,
    ...(table === 'actuals' ? { actual_date: original.actual_date } : { year: original.year, month: original.month }),
  })) {
    query = value == null ? query.is(field, null) : query.eq(field, value)
  }
  const { data, error } = await query.select('id').maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('This record changed or you no longer have permission. Refresh the records and try again.')
}
