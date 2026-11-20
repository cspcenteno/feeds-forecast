import test from 'node:test'
import assert from 'node:assert/strict'
import { loadMonthlyReferences, monthlyReferenceKey } from '../lib/sales-monthly-references.ts'

test('monthly references batch all five levels below the response cap without dropping forecasts', async () => {
  const calls = []
  const levels = ['asm', 'rsm', 'kam', 'customer', 'product']
  const client = { rpc: async (name, args) => {
    calls.push({ name, ...args })
    return { error: null, data: args.p_ids.flatMap(id => levels.map(team_level => ({
      forecast_id: id, team_level, budget_volume: id, actual_volume: 1, previous_actual_volume: 2, forecast_volume: 3,
    }))) }
  } }
  const result = await loadMonthlyReferences(client, Array.from({ length: 203 }, (_, i) => i + 1), 'saved')
  assert.deepEqual(calls.map(call => call.p_ids.length), [100, 100, 3])
  assert.ok(calls.every(call => call.name === 'get_sales_monthly_reference' && call.p_source === 'saved'))
  assert.equal(result.size, 1015)
  assert.equal(result.get(monthlyReferenceKey(203, 'customer')).budget_volume, 203)
  assert.equal(result.get(monthlyReferenceKey(203, 'kam')).forecast_volume, 3)
})

test('empty scopes need no request and failures do not silently return partial totals', async () => {
  const client = { rpc: async () => { throw new Error('unexpected call') } }
  assert.equal((await loadMonthlyReferences(client, [], 'weekly')).size, 0)
  await assert.rejects(loadMonthlyReferences({ rpc: async () => ({ data: null, error: { message: 'Denied' } }) }, [1], 'approvals'), /Denied/)
})
