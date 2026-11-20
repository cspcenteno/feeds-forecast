import * as XLSX from 'xlsx'

const header = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
export function findActualHeaderRow(sheet: XLSX.WorkSheet) {
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1')
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 99); r++) {
    const names = new Set<string>()
    for (let c = range.s.c; c <= range.e.c; c++) names.add(header(sheet[XLSX.utils.encode_cell({ r, c })]?.v))
    const has = (aliases: string[]) => aliases.some(alias => names.has(header(alias)))
    if (has(['date', 'actual date', 'sales date', 'transaction date', 'trans date']) || (has(['year']) && has(['month']))) {
      if (has(['customer', 'customer name', 'partynme']) && has(['product code', 'code', 'sku', 'item no']) && has(['volume', 'actual', 'actual volume', 'actual vol', 'volume actual', 'actual (vol.)', 'actuals', 'actuals volume', 'actuals vol', 'volume actuals', 'actuals (vol.)', 'at50 kg'])) return r
    }
  }
  throw new Error('Could not find the Actuals column headers in the first 100 worksheet rows. Include Date, Customer, Product Code and Volume (or their Oracle headers).')
}

export function parseOracleActualDate(value: unknown) {
  const match = /^(\d{1,2})[- ]([a-z]{3})[- ](\d{2}|\d{4})$/i.exec(String(value ?? '').trim())
  if (!match) return null
  const month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[2].toLowerCase())
  const year = Number(match[3].length === 2 ? '20' + match[3] : match[3])
  const day = Number(match[1]), date = new Date(Date.UTC(year, month, day))
  return month >= 0 && year >= 2020 && year <= 2100 && date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null
}

export type ImportKam = { id: string; full_name: string | null; email: string | null; region_id: number | null; subregion_id: number | null }
export const oracleSalespersonName = (value: string | null) => (value ?? '').trim().replace(/^[a-z0-9]{2,8}\s*-\s*AN\s+/i, '').replace(/\s+/g, ' ')
const identity = (value: string | null) => oracleSalespersonName(value).toLowerCase()
export function resolveOracleKam(value: string, users: ImportKam[]) {
  const key = identity(value)
  const matches = users.filter(user => key && [identity(user.full_name), identity(user.email)].includes(key))
  if (matches.length !== 1) throw new Error(matches.length ? `Multiple salesperson assignments match: ${value}` : `Salesperson assignment not found (KAM/RSM/ASM): ${value}`)
  if (matches[0].region_id === null) throw new Error(`Salesperson has no assigned region: ${value}`)
  return matches[0]
}
