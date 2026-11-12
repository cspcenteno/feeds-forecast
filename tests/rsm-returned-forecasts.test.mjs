import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canReviseRsmForecast, rsmRevisionPayload } from '../lib/rsm-returned-forecasts.ts'

const item = { id: 1, user_id: 'kam', customer_id: 1, region_id: 1, subregion_id: 11,
  year: 2026, week: 46, product_id: 10, forecast: 20, volume: 20, status: 'Rejected', returned_at: '2026-11-11' }
const actor = { role: 'Manager', position: ' rsm ', regionId: 1, subregionId: 11 }

test('RSM revision controls require the exact assigned area and a returned forecast', () => {
  assert.equal(canReviseRsmForecast(item, actor), true)
  assert.equal(canReviseRsmForecast({ ...item, status: 'Draft' }, actor), true)
  for (const change of [{ region_id: 2 }, { subregion_id: 12 }, { status: 'Pending' }, { status: 'Approved' }, { status: 'Draft', returned_at: null }]) {
    assert.equal(canReviseRsmForecast({ ...item, ...change }, actor), false)
  }
  for (const change of [{ role: 'User' }, { position: 'ASM' }, { regionId: null }, { subregionId: null }]) {
    assert.equal(canReviseRsmForecast(item, { ...actor, ...change }), false)
  }
})

test('revision payload includes concurrency checks without transferring ownership', () => {
  assert.deepEqual(rsmRevisionPayload([item], [{ id: 1, product_id: 11, forecast: 30 }]), [
    { id: 1, product_id: 11, forecast: 30, original: { product_id: 10, forecast: 20, status: 'Rejected' } },
  ])
  assert.throws(() => rsmRevisionPayload([item], [{ id: 2, product_id: 11, forecast: 30 }]), /unavailable/)
})
