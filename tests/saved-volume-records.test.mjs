import { test } from 'node:test'
import assert from 'node:assert/strict'
import { persistSavedVolumeUpdate, validateSavedVolumePeriod } from '../lib/saved-volume-records.ts'
import { getBudgetImportKey } from '../lib/budget-import-key.ts'

const record = { id: 12, volume: 25, region_id: 1, subregion_id: null, customer_id: 3,
  product_id: 4, category_id: 5, asm: null, rsm: 'RSM', kam: 'KAM', year: 2026, month: null, actual_date: '2026-11-08' }

test('budget duplicate keys keep KAM identity and normalize its name', () => {
  assert.equal(getBudgetImportKey(2026, 11, 1, 3, 4, '  Chris   KAM '), getBudgetImportKey(2026, 11, 1, 3, 4, 'chris kam'))
  assert.notEqual(getBudgetImportKey(2026, 11, 1, 3, 4, 'Chris'), getBudgetImportKey(2026, 11, 1, 3, 4, 'Alex'))
  assert.equal(getBudgetImportKey(2026, 11, 1, 3, 4, null), getBudgetImportKey(2026, 11, 1, 3, 4, ''))
})

function clientReturning(result) {
  const calls = []
  const query = Object.fromEntries(['update', 'eq', 'is', 'select'].map((method) => [method, (...args) => { calls.push([method, ...args]); return query }]))
  query.maybeSingle = async () => result
  return { client: { from: (table) => { calls.push(['from', table]); return query } }, calls }
}

test('saved volumes accept zero and decimals but reject empty, negative and nonfinite values', () => {
  for (const volume of ['0', '12.5']) assert.doesNotThrow(() => validateSavedVolumePeriod(volume, false, '2026', '', ''))
  for (const volume of ['', ' ', '-1', 'NaN', 'Infinity']) assert.throws(() => validateSavedVolumePeriod(volume, false, '2026', '', ''), /valid volume/)
})

test('budget periods retain annual support and reject invalid years or months', () => {
  assert.doesNotThrow(() => validateSavedVolumePeriod('12', false, '2026', '11', ''))
  for (const [year, month] of [['2019', '1'], ['2101', '1'], ['2026', '13'], ['2026', '1.5']]) {
    assert.throws(() => validateSavedVolumePeriod('12', false, year, month, ''), /year/)
  }
})

test('actual dates reject calendar rollover rather than saving a different day', () => {
  assert.doesNotThrow(() => validateSavedVolumePeriod('12', true, '', '', '2024-02-29'))
  for (const date of ['', '2026-02-29', '2026-11-31', 'invalid']) {
    assert.throws(() => validateSavedVolumePeriod('12', true, '', '', date), /Actual date/)
  }
})

test('saved budget updates target one original snapshot and preserve null dimensions', async () => {
  const { client, calls } = clientReturning({ data: { id: 12 }, error: null })
  await persistSavedVolumeUpdate(client, 'budgets', record, { volume: 30 })
  assert.deepEqual(calls[0], ['from', 'budgets'])
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(['eq', 'id', 12])))
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(['eq', 'volume', 25])))
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(['is', 'month', null])))
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(['is', 'subregion_id', null])))
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(['select', 'id'])))
})

test('actual updates filter by original date, and failed or unmatched updates never report success', async () => {
  const { client, calls } = clientReturning({ data: { id: 12 }, error: null })
  await persistSavedVolumeUpdate(client, 'actuals', record, { volume: 30 })
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(['eq', 'actual_date', '2026-11-08'])))
  assert.equal(calls.some((call) => call[1] === 'year'), false)
  await assert.rejects(persistSavedVolumeUpdate(clientReturning({ data: null, error: null }).client, 'budgets', record, { volume: 30 }), /changed or you no longer have permission/)
  await assert.rejects(persistSavedVolumeUpdate(clientReturning({ data: null, error: { message: 'permission denied' } }).client, 'actuals', record, { volume: 30 }), /permission denied/)
})
