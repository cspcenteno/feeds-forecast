import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseForecastWeek, validateForecastImport } from '../lib/forecast-import.ts'
import { actualTemplateColumns, budgetTemplateColumns, forecastTemplateColumns } from '../lib/import-template-columns.ts'
import * as XLSX from 'xlsx'

const refs = {
  users: [
    { id: 'user-a', full_name: 'KAM A', is_active: true, region_id: 1, subregion_id: 2 },
    { id: 'user-b', full_name: 'KAM B', is_active: true, region_id: 1, subregion_id: 2 },
  ],
  regions: [{ id: 1, name: 'North', code: 'N' }],
  subregions: [{ id: 2, name: 'Area A', region_id: 1 }],
  customers: [{ id: 3, customer: 'Customer A', region_id: 1 }],
  products: [{ id: 4, code: 'P001', name: 'Product A', category_id: 5, weight: 50 }],
  forecasts: [], locks: [{ year: 2026, week: 1, status: 'Open' }, { year: 2026, week: 53, status: 'Open' }],
}
const scope = { allRegions: false, regionId: 1, subregionId: 2 }
const row = { id: 'row-1', year: '2026', week: '1', region: 'N', subregion: '', customer: 'Customer A', product_code: 'P001', forecast: '1,000', kam: 'KAM A' }
const validate = (input = row, references = refs, access = scope) => validateForecastImport([input], references, access)[0]

test('matches region codes and computes volume from quantity and product weight', () => {
  const result = validate()
  assert.equal(result.status, 'Ready')
  assert.deepEqual(result.payload, { year: 2026, week: 1, region_id: 1, subregion_id: 2, customer_id: 3, category_id: 5, product_id: 4, forecast: 1000, volume: 50000, kam: 'KAM A', user_id: 'user-a' })
})

test('rejects locked weeks and missing reference matches', () => {
  assert.equal(validate(row, { ...refs, locks: [{ year: 2026, week: 1, status: 'Locked' }] }).status, 'Invalid')
  for (const field of ['region', 'customer', 'product_code']) {
    assert.equal(validate({ ...row, [field]: 'Unknown' }).status, 'Invalid')
  }
})

test('keeps duplicate and imported records valid but ineligible for import', () => {
  const results = validateForecastImport([row, { ...row, id: 'row-2' }], refs, scope)
  assert.equal(results[0].status, 'Ready')
  assert.equal(results[1].status, 'Duplicate in upload')
  assert.equal(results[1].issues.length, 0)
  const existing = { user_id: 'user-a', year: 2026, week: 1, region_id: 1, subregion_id: 2, customer_id: 3, product_id: 4 }
  const imported = validate(row, { ...refs, forecasts: [existing] })
  assert.equal(imported.status, 'Already imported')
  assert.equal(imported.issues.length, 0)
})

test('enforces assigned region and subregion and permits Admin scope', () => {
  assert.equal(validate(row, refs, { ...scope, regionId: 9 }).status, 'Invalid')
  assert.equal(validate({ ...row, subregion: 'Area A' }, refs, { ...scope, subregionId: null }).status, 'Invalid')
  assert.equal(validate(row, refs, { allRegions: true, regionId: null, subregionId: null }).status, 'Ready')
})

test('rejects negative, missing, and non-finite quantities while accepting zero', () => {
  for (const forecast of ['-1', '', 'Infinity', 'abc', '1e309']) {
    assert.equal(validate({ ...row, forecast }).status, 'Invalid', forecast)
  }
  assert.equal(validate({ ...row, forecast: '0' }).status, 'Ready')
})

test('validates ISO week 53 against the selected year', () => {
  assert.equal(validate({ ...row, year: '2026', week: '53' }).status, 'Ready')
  assert.equal(validate({ ...row, year: '2025', week: '53' }).status, 'Invalid')
})

test('rejects ambiguous customers and products without categories', () => {
  assert.equal(validate(row, { ...refs, customers: [...refs.customers, { ...refs.customers[0], id: 6 }] }).status, 'Invalid')
  assert.equal(validate(row, { ...refs, products: [{ ...refs.products[0], category_id: null }] }).status, 'Invalid')
})

test('preserves null volume for products without weight, matching manual entry', () => {
  const result = validate(row, { ...refs, products: [{ ...refs.products[0], weight: null }] })
  assert.equal(result.status, 'Ready')
  assert.equal(result.payload.volume, null)
})

test('accepts month date ranges including the partial first week of the year', () => {
  assert.equal(parseForecastWeek('Jan 1 - Jan 4', 2026), 1)
  assert.equal(parseForecastWeek('Jan 5 – Jan 11', 2026), 2)
  assert.equal(parseForecastWeek('January 5 - 11', 2026), 2)
  assert.equal(parseForecastWeek('Dec 29 - Jan 4', 2026), 1)
  assert.equal(parseForecastWeek('Dec 28 - Jan 3', 2026), 53)
  for (const week of ['Jan 1 - Jan 5', 'Feb 30 - Mar 1', 'Jan 11 - Jan 5', 'Foo 1 - Foo 4']) {
    assert.equal(parseForecastWeek(week, 2026), null, week)
  }
})

test('date-range imports use the same duplicate and week-lock checks as numeric weeks', () => {
  const ranged = { ...row, week: 'Jan 1 - Jan 4' }
  assert.equal(validate(ranged).payload.week, 1)
  assert.equal(validate(ranged, { ...refs, locks: [{ year: 2026, week: 1, status: 'Locked' }] }).status, 'Invalid')
  const results = validateForecastImport([ranged, { ...row, id: 'row-2' }], refs, scope)
  assert.equal(results[1].status, 'Duplicate in upload')
})

test('accepts volume instead of forecast and derives quantity without altering volume', () => {
  const result = validate({ ...row, week: 'Jan 1 - Jan 4', forecast: '', volume: '1,250' })
  assert.equal(result.status, 'Ready')
  assert.equal(result.payload.volume, 1250)
  assert.equal(result.payload.forecast, 25)
  const zero = validate({ ...row, forecast: '', volume: '0' })
  assert.equal(zero.status, 'Ready')
  assert.equal(zero.payload.forecast, 0)
})

test('volume-only input needs a valid positive product weight', () => {
  for (const weight of [null, 0, -50]) {
    assert.equal(validate({ ...row, forecast: '', volume: '100' }, {
      ...refs, products: [{ ...refs.products[0], weight }],
    }).status, 'Invalid')
  }
  for (const volume of ['-1', 'Infinity', 'abc']) {
    assert.equal(validate({ ...row, forecast: '', volume }).status, 'Invalid')
  }
})

test('requires supplied quantity and volume to agree with product weight', () => {
  assert.equal(validate({ ...row, forecast: '25', volume: '1250' }).status, 'Ready')
  assert.equal(validate({ ...row, forecast: '25', volume: '1000' }).status, 'Invalid')
})

test('resolves KAM full names to the forecast owner', () => {
  assert.equal(validate({ ...row, kam: '  KAM A  ' }).payload.kam, 'KAM A')
  assert.equal(validate({ ...row, kam: '  kam   a  ' }).payload.user_id, 'user-a')
  assert.equal(validate({ ...row, kam: '' }).status, 'Invalid')
})

test('the seven-column Forecast format imports volume without requiring a customer', () => {
  const result = validate({ ...row, week: 'Jan 1 - Jan 4', kam: 'KAM A', product_name: 'Product A', customer: '', forecast: '', volume: '1250' })
  assert.equal(result.status, 'Ready')
  assert.equal(result.payload.customer_id, null)
  assert.equal(result.payload.forecast, 25)
  assert.equal(result.payload.volume, 1250)
  assert.equal(result.payload.kam, 'KAM A')
})

test('download templates preserve the requested column positions in Excel', () => {
  assert.deepEqual([...forecastTemplateColumns], ['region', 'year', 'week', 'kam', 'customer', 'product_code', 'product_name', 'volume'])
  assert.deepEqual([...budgetTemplateColumns], ['year', 'month', 'region', 'kam', 'customer', 'product_code', 'product_name', 'volume'])
  assert.deepEqual([...actualTemplateColumns], ['date', 'year', 'month', 'region', 'kam', 'customer', 'product_code', 'product_name', 'volume'])
  for (const columns of [forecastTemplateColumns, budgetTemplateColumns, actualTemplateColumns]) {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[...columns]]), 'Import')
    const downloaded = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' })
    assert.deepEqual(XLSX.utils.sheet_to_json(downloaded.Sheets.Import, { header: 1 }), [[...columns]])
  }
})

test('same week and product are separate forecasts for different KAM owners', () => {
  const results = validateForecastImport([row, { ...row, id: 'row-2', kam: 'KAM B' }], refs, scope)
  assert.deepEqual(results.map((item) => item.status), ['Ready', 'Ready'])
  assert.deepEqual(results.map((item) => item.payload.user_id), ['user-a', 'user-b'])
  const existing = { user_id: 'user-a', year: 2026, week: 1, region_id: 1, subregion_id: 2, customer_id: 3, product_id: 4 }
  assert.equal(validate({ ...row, kam: 'KAM B' }, { ...refs, forecasts: [existing] }).status, 'Ready')
  assert.equal(validate(row, { ...refs, forecasts: [existing] }).status, 'Already imported')
})

test('normalization does not bypass same-KAM duplicate checks', () => {
  const results = validateForecastImport([row, { ...row, id: 'row-2', kam: '  kam   a ' }], refs, scope)
  assert.equal(results[1].status, 'Duplicate in upload')
})

test('rejects unknown, inactive, and ambiguous KAM full names', () => {
  assert.equal(validate({ ...row, kam: 'Unknown Person' }).status, 'Invalid')
  assert.equal(validate(row, { ...refs, users: [{ ...refs.users[0], is_active: false }] }).status, 'Invalid')
  assert.equal(validate(row, { ...refs, users: [...refs.users, { ...refs.users[0], id: 'user-c' }] }).status, 'Invalid')
})

test('missing week-lock status fails closed rather than treating the week as open', () => {
  const result = validate(row, { ...refs, locks: [] })
  assert.equal(result.status, 'Invalid')
  assert.match(result.issues.join(' '), /Week lock status is unavailable/)
})
