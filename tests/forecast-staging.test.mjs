import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deleteForecastStaging, fromForecastStagingRow, loadForecastStaging, toForecastStagingValues, updateForecastStaging } from '../lib/forecast-staging.ts'

test('raw staging values preserve invalid input without sending a temporary ID', () => {
  const values = toForecastStagingValues({ id: 'temporary-id', year: 'bad year', week: 'Jan 1 - Jan 4', region: ' North ', subregion: '', customer: '', product_code: 'P001', forecast: '', volume: 'not a number', kam: 'KAM A', product_name: 'Product A' })
  assert.equal(values.year, 'bad year')
  assert.equal(values.volume, 'not a number')
  assert.equal(values.region, 'North')
  assert.equal(values.forecast, null)
  assert.equal(values.kam, 'KAM A')
  assert.equal('id' in values, false)
  assert.equal('uploaded_by' in values, false)
})

test('database rows restore the numeric identity and nullable fields for validation', () => {
  const row = fromForecastStagingRow({ id: 42, week: 'Jan 1 - Jan 4', volume: '1250', kam: 'KAM A' })
  assert.equal(row.id, '42')
  assert.equal(row.week, 'Jan 1 - Jan 4')
  assert.equal(row.volume, '1250')
  assert.equal(row.customer, '')
  assert.equal(row.forecast, '')
})

test('loads multiple staging pages using the database ID cursor', async () => {
  const pages = [Array.from({ length: 500 }, (_, index) => ({ id: index + 1, volume: '1' })), [{ id: 501, volume: '2' }]]
  const cursors = []
  const client = { from(table) {
    assert.equal(table, 'forecast_import_staging')
    return { select() { return this }, order() { return this }, limit(size) { assert.equal(size, 500); return this }, gt(column, id) { cursors.push([column, id]); return this }, async abortSignal() { return { data: pages.shift(), error: null } } }
  } }
  const rows = await loadForecastStaging(client)
  assert.equal(rows.length, 501)
  assert.equal(rows[500].id, '501')
  assert.deepEqual(cursors, [['id', '500']])
})

test('staging read errors are reported instead of returning an empty preview', async () => {
  const client = { from() { return { select() { return this }, order() { return this }, limit() { return this }, async abortSignal() { return { data: null, error: { message: 'permission denied' } } } } } }
  await assert.rejects(loadForecastStaging(client), /permission denied/)
})

test('edits target the persisted staging ID and reject silent permission failures', async () => {
  let selectedId
  let values
  const client = { from() { return { update(value) { values = value; return this }, eq(column, id) { selectedId = id; return this }, select() { return this }, async maybeSingle() { return { data: null, error: null } } } } }
  await assert.rejects(updateForecastStaging(client, { id: '42', region: 'North', year: '2026', week: '1', subregion: '', customer: '', product_code: 'P001', forecast: '', volume: '1250' }), /unavailable/)
  assert.equal(selectedId, '42')
  assert.equal(values.volume, '1250')
})

test('discard deletes only staging rows in bounded batches', async () => {
  const batches = []
  const client = { from(table) {
    assert.equal(table, 'forecast_import_staging')
    let current
    return { delete() { return this }, in(column, ids) { assert.equal(column, 'id'); current = ids; batches.push(ids); return this }, async select() { return { data: current.map((id) => ({ id })), error: null } } }
  } }
  const ids = Array.from({ length: 251 }, (_, index) => String(index + 1))
  await deleteForecastStaging(client, ids)
  assert.deepEqual(batches.map((batch) => batch.length), [250, 1])
})
