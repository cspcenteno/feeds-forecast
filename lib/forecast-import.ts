export type ForecastImportRow = {
  id: string
  year: string
  week: string
  region: string
  subregion: string
  customer: string
  product_code: string
  forecast: string
  volume?: string
  kam?: string
  product_name?: string
}

export type ForecastImportReferences = {
  users: { id: string; full_name: string | null; is_active: boolean; region_id: number | null; subregion_id: number | null }[]
  regions: { id: number; name: string; code: string | null }[]
  subregions: { id: number; name: string; region_id: number | null }[]
  customers: { id: number; customer: string; region_id: number | null }[]
  products: { id: number; code: string; name: string; category_id: number | null; weight: number | null }[]
  forecasts: { user_id: string; year: number; week: number; region_id: number | null; subregion_id: number | null; customer_id: number | null; product_id: number | null }[]
  locks: { year: number; week: number; status: string }[]
}

export type ForecastImportScope = {
  allRegions: boolean
  regionId: number | null
  subregionId: number | null
}

export const forecastImportFields = [
  ['region', 'Region'], ['year', 'Year'], ['week', 'Week'], ['kam', 'KAM / Salesman'],
  ['product_code', 'Product Code'], ['product_name', 'Product Name'], ['volume', 'Volume'],
] as const

// Continue accepting older files without adding extra template columns.
export const forecastImportInputFields = [
  ...forecastImportFields, ['subregion', 'Subregion'], ['customer', 'Customer'], ['forecast', 'Forecast (Qty.)'],
] as const

export function normalizeImportText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function key(row: ForecastImportReferences['forecasts'][number]) {
  return [row.user_id, row.year, row.week, row.region_id, row.subregion_id ?? '', row.customer_id, row.product_id].join('|')
}

// Week ranges can be clipped at a month/year boundary (Jan 1 - Jan 4).
// Every date in the range must still belong to the same ISO week/year.
export function parseForecastWeek(value: string, year: number): number | null {
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return null
  const jan1 = new Date(Date.UTC(year, 0, 1)).getUTCDay()
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const maxWeek = jan1 === 4 || (jan1 === 3 && leap) ? 53 : 52
  const numeric = Number(value)
  if (/^\d+$/.test(value.trim())) return Number.isInteger(numeric) && numeric >= 1 && numeric <= maxWeek ? numeric : null
  const match = /^\s*([a-z]+)\.?\s+(\d{1,2})\s*[-–—]\s*(?:([a-z]+)\.?\s+)?(\d{1,2})\s*$/i.exec(value)
  if (!match) return null
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
  const monthIndex = (name: string) => months.findIndex((month) => name.toLowerCase() === month || name.toLowerCase() === month.slice(0, 3))
  const startMonth = monthIndex(match[1])
  const endMonth = monthIndex(match[3] ?? match[1])
  if (startMonth < 0 || endMonth < 0) return null
  const startDay = Number(match[2])
  const endDay = Number(match[4])
  function isoWeek(date: Date) {
    const thursday = new Date(date)
    thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7))
    const isoYear = thursday.getUTCFullYear()
    const week = Math.ceil(((thursday.getTime() - Date.UTC(isoYear, 0, 1)) / 86400000 + 1) / 7)
    return { year: isoYear, week }
  }
  for (const startYear of [year - 1, year, year + 1]) {
    const endYear = startYear + (endMonth < startMonth ? 1 : 0)
    const start = new Date(Date.UTC(startYear, startMonth, startDay))
    const end = new Date(Date.UTC(endYear, endMonth, endDay))
    if (start.getUTCMonth() !== startMonth || start.getUTCDate() !== startDay || end.getUTCMonth() !== endMonth || end.getUTCDate() !== endDay) continue
    const days = (end.getTime() - start.getTime()) / 86400000
    const first = isoWeek(start)
    const last = isoWeek(end)
    if (days >= 0 && days <= 6 && first.year === year && last.year === year && first.week === last.week) return first.week
  }
  return null
}

export function validateForecastImport(
  rows: ForecastImportRow[], refs: ForecastImportReferences, scope: ForecastImportScope,
) {
  const saved = new Set(refs.forecasts.map(key))
  const seen = new Set<string>()
  const weekStates = new Map(refs.locks.map((row) => [`${row.year}|${row.week}`, row.status]))
  return rows.map((source) => {
    const issues: string[] = []
    const matchingUsers = refs.users.filter((user) => user.is_active && normalizeImportText(user.full_name) === normalizeImportText(source.kam) && Boolean(source.kam?.trim()))
    const owner = matchingUsers.length === 1 ? matchingUsers[0] : null
    if (!source.kam?.trim()) issues.push('KAM full name is required.')
    else if (!matchingUsers.length) issues.push('KAM full name does not match an active user.')
    else if (matchingUsers.length > 1) issues.push('Multiple active users match this KAM full name.')
    const year = Number(source.year)
    const week = parseForecastWeek(source.week, year)
    const yearValid = Number.isInteger(year) && year >= 2020 && year <= 2100
    if (!yearValid) issues.push('Year must be between 2020 and 2100.')
    if (week === null) issues.push('Use a valid week number or date range within one week, e.g. Jan 1 - Jan 4.')
    if (week !== null) {
      const status = weekStates.get(`${year}|${week}`)
      if (!status) issues.push('Week lock status is unavailable. Refresh validation before importing.')
      else if (status !== 'Open') issues.push('This week is locked.')
    }
    const regions = refs.regions.filter((row) => normalizeImportText(row.name) === normalizeImportText(source.region) ||
      (Boolean(row.code?.trim()) && normalizeImportText(row.code) === normalizeImportText(source.region)))
    const region = regions.length === 1 ? regions[0] : null
    if (!region) issues.push(source.region.trim() ? 'Region not found or ambiguous.' : 'Region is required.')
    if (region && !scope.allRegions && region.id !== scope.regionId) issues.push('You can only import into your assigned region.')
    const subregions = refs.subregions.filter((row) => row.region_id === region?.id &&
      normalizeImportText(row.name) === normalizeImportText(source.subregion))
    const subregion = source.subregion.trim()
      ? subregions.length === 1 ? subregions[0] : null
      : refs.subregions.find((row) => row.id === (owner?.subregion_id ?? scope.subregionId) && row.region_id === region?.id) ?? null
    if (source.subregion.trim() && !subregion) issues.push('Subregion not found or ambiguous in this region.')
    if (!scope.allRegions && (subregion?.id ?? null) !== scope.subregionId) issues.push('You can only import into your assigned subregion.')
    const customers = refs.customers.filter((row) => row.region_id === region?.id &&
      normalizeImportText(row.customer) === normalizeImportText(source.customer))
    const customer = customers.length === 1 ? customers[0] : null
    if (source.customer.trim() && !customer) issues.push('Customer not found or ambiguous in this region.')
    const products = refs.products.filter((row) => normalizeImportText(row.code) === normalizeImportText(source.product_code))
    const product = products.length === 1 ? products[0] : null
    if (!product || product.category_id === null) issues.push('Product code not found, ambiguous, or missing a category.')
    const hasQuantity = Boolean(source.forecast.trim())
    const hasVolume = Boolean(source.volume?.trim())
    let quantity = hasQuantity ? Number(source.forecast.replace(/,/g, '')) : NaN
    let volume = hasVolume ? Number(source.volume!.replace(/,/g, '')) : null
    if (!hasQuantity && !hasVolume) issues.push('Forecast quantity or Volume is required.')
    if (hasQuantity && (!Number.isFinite(quantity) || quantity < 0)) issues.push('Forecast must be a non-negative quantity.')
    if (hasVolume && (!Number.isFinite(volume) || volume! < 0)) issues.push('Volume must be a non-negative number.')
    const weight = product?.weight == null ? null : Number(product.weight)
    if (hasVolume && !hasQuantity) {
      if (weight === null || !Number.isFinite(weight) || weight <= 0) issues.push('Product weight must be greater than zero to calculate quantity from Volume.')
      else quantity = volume! / weight
    } else if (!hasVolume) {
      volume = weight === null ? null : quantity * weight
    } else if (weight === null || !Number.isFinite(weight) || Math.abs(quantity * weight - volume!) > Math.max(1e-6, Math.abs(volume!) * 1e-6)) {
      issues.push('Forecast quantity and Volume do not match the product weight. Supply one value or correct both.')
    }
    if ((hasQuantity || hasVolume) && !Number.isFinite(quantity)) issues.push('Calculated quantity is not a finite number.')
    if (volume !== null && !Number.isFinite(volume)) issues.push('Calculated volume is not a finite number.')
    const payload = {
      year, week: week ?? 0, region_id: region?.id ?? null, subregion_id: subregion?.id ?? null,
      customer_id: customer?.id ?? null, category_id: product?.category_id ?? null,
      product_id: product?.id ?? null, forecast: quantity, volume,
      kam: owner?.full_name?.trim() ?? source.kam?.trim() ?? null,
      user_id: owner?.id ?? '',
    }
    const rowKey = key(payload)
    let status: 'Ready' | 'Invalid' | 'Already imported' | 'Duplicate in upload' = 'Invalid'
    if (!issues.length) {
      status = saved.has(rowKey) ? 'Already imported' : seen.has(rowKey) ? 'Duplicate in upload' : 'Ready'
      seen.add(rowKey)
    }
    return { source, payload, issues, status, product, region, customer }
  })
}

export function forecastImportPeriods(rows: ForecastImportRow[]) {
  return rows.flatMap((row) => {
    const year = Number(row.year)
    const week = parseForecastWeek(row.week, year)
    return week === null ? [] : [{ year, week }]
  })
}
