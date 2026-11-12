import { test } from 'node:test'
import assert from 'node:assert/strict'
import { savedCustomerGroupKey, savedKamGroupKey } from '../lib/saved-forecast-kam-groups.ts'

test('RSM customer groups separate KAM owners and review statuses', () => {
  const item = { user_id:'kam-a', customer_id:1, status:'Rejected' }
  assert.notEqual(savedCustomerGroupKey(item,true),savedCustomerGroupKey({...item,user_id:'kam-b'},true))
  assert.notEqual(savedCustomerGroupKey(item,true),savedCustomerGroupKey({...item,status:'Draft'},true))
  assert.equal(savedCustomerGroupKey(item,false),savedCustomerGroupKey({...item,user_id:'kam-b'},false))
})

test('KAM expansion keys remain distinct between weeks and owners', () => {
  assert.notEqual(savedKamGroupKey('2026-W46','kam-a'),savedKamGroupKey('2026-W47','kam-a'))
  assert.notEqual(savedKamGroupKey('2026-W46','kam-a'),savedKamGroupKey('2026-W46','kam-b'))
})
