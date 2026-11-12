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

export function orderVolumeEditorRows<T extends { id: number; year: number; month: number | null; actual_date?: string }>(rows: T[], isActual: boolean): T[] {
  return [...rows].sort((a, b) => (isActual
    ? (a.actual_date ?? '').localeCompare(b.actual_date ?? '')
    : a.year - b.year || (a.month ?? 0) - (b.month ?? 0)) || a.id - b.id)
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

export async function persistCustomerVolumeUpdates(
  client: Pick<ReturnType<typeof createClient>, 'rpc'>,
  module: 'Budgets' | 'Actuals',
  rows: { original: Snapshot; volume: string; year: string; month: string; actualDate: string;
    kam?: string | null; customerId?: number | null; regionId?: number | null;
    productId?: number | null; categoryId?: number | null }[],
) {
  const changes = rows.filter((row) => Number(row.volume) !== Number(row.original.volume)
    || (row.kam !== undefined && row.kam !== row.original.kam)
    || (row.customerId !== undefined && row.customerId !== row.original.customer_id)
    || (row.regionId !== undefined && row.regionId !== row.original.region_id)
    || (row.productId !== undefined && row.productId !== row.original.product_id)
    || (row.categoryId !== undefined && row.categoryId !== row.original.category_id)
    || (module === 'Actuals' ? row.actualDate !== row.original.actual_date
      : Number(row.year) !== row.original.year || (row.month === '' ? null : Number(row.month)) !== row.original.month))
  if (!changes.length) return 0
  const records = changes.map((row) => {
    validateSavedVolumePeriod(row.volume, module === 'Actuals', row.year, row.month, row.actualDate)
    const { id, volume, region_id, subregion_id, customer_id, product_id, category_id, asm, rsm, kam } = row.original
    return {
      id,
      original: { volume, region_id, subregion_id, customer_id, product_id, category_id, asm, rsm, kam,
        ...(module === 'Actuals' ? { actual_date: row.original.actual_date } : { year: row.original.year, month: row.original.month }) },
      volume: Number(row.volume),
      ...(row.kam !== undefined ? { kam: row.kam } : {}),
      ...(row.customerId !== undefined ? { customer_id: row.customerId } : {}),
      ...(row.regionId !== undefined ? { region_id: row.regionId } : {}),
      ...(row.productId !== undefined ? { product_id: row.productId } : {}),
      ...(row.categoryId !== undefined ? { category_id: row.categoryId } : {}),
      ...(module === 'Actuals' ? { actual_date: row.actualDate } : { year: Number(row.year), month: row.month === '' ? null : Number(row.month) }),
    }
  })
  const { data, error } = await client.rpc('update_customer_volume_records', { p_module: module, p_records: records })
  if (error) throw new Error(error.message)
  return Number(data)
}
