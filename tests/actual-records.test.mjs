import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadActualRecords } from '../lib/actual-records.ts'

function clientFor(results) {
  const calls = []
  const client = { from(table) {
    const call = { table, filters: [] }
    calls.push(call)
    const query = {
      select() { return query },
      gte(...args) { call.filters.push(['gte', ...args]); return query },
      lt(...args) { call.filters.push(['lt', ...args]); return query },
      order() { return query },
      range() { return query },
      eq(...args) { call.filters.push(['eq', ...args]); return query },
      in(...args) { call.filters.push(['in', ...args]); return query },
      then(resolve, reject) { return Promise.resolve(results.shift()).then(resolve, reject) },
    }
    return query
  } }
  return { client, calls }
}

test('saved actual references constrain every year to forecast regions and customers', async () => {
  const { client, calls } = clientFor([
    { data: [{ actual_date: '2026-11-01', volume: 12 }], error: null },
    { data: [], error: null },
  ])
  const result = await loadActualRecords(client, [2026, 2025, 2026], { regionIds: [1], customerIds: [2, 3] })
  assert.equal(calls.length, 2)
  for (const call of calls) {
    assert.ok(call.filters.some(([op, field, values]) => op === 'in' && field === 'region_id' && values[0] === 1))
    assert.ok(call.filters.some(([op, field, values]) => op === 'in' && field === 'customer_id' && values.join() === '2,3'))
  }
  assert.equal(result.data[0].year, 2026)
  assert.equal(result.data[0].month, 11)
})

test('empty saved customer scope does not load all actuals', async () => {
  const { client, calls } = clientFor([])
  assert.deepEqual(await loadActualRecords(client, [2026], { regionIds: [1], customerIds: [] }), { data: [], error: null })
  assert.equal(calls.length, 0)
})

test('selected-customer scope and database errors remain intact', async () => {
  const error = { message: 'canceling statement due to statement timeout' }
  const { client, calls } = clientFor([{ data: null, error }])
  assert.deepEqual(await loadActualRecords(client, [2026], { regionId: 1, customerId: 2 }), { data: null, error })
  assert.ok(calls[0].filters.some(([op, field, value]) => op === 'eq' && field === 'customer_id' && value === 2))
})
