import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildKamVolumeScope } from '../lib/kam-volume-scope.ts'
import { buildDashboardPerformance } from '../lib/dashboard-performance.ts'

const kams = [
  { id: 'alice', full_name: 'Alice Smith', email: 'alice@example.com' },
  { id: 'bob', full_name: 'Bob Jones', email: 'bob@example.com' },
]
const customers = [{ id: 10, salesman: 'Alice Smith' }, { id: 20, salesman: 'Bob Jones' }]
const row = { region_id: 1, subregion_id: 11, customer_id: 10, product_id: 100, kam: 'Alice Smith', volume: 30 }

test('KAM-labelled imports are included without any approved forecast', () => {
  const owns = buildKamVolumeScope('alice', 1, kams, customers, new Set())
  assert.equal(owns(row), true)
  assert.equal(owns({ ...row, kam: '  ALICE   SMITH ' }), true)
  assert.equal(owns({ ...row, kam: 'ALICE@EXAMPLE.COM' }), true)
  assert.equal(owns({ ...row, kam: null }), true)
  assert.equal(owns({ ...row, kam: 'Unknown import label' }), true)
})

test('explicit ownership beats a shared customer/product forecast key', () => {
  const keys = new Set([JSON.stringify([1,10,100])])
  const owns = buildKamVolumeScope('alice', 1, kams, customers, keys)
  assert.equal(owns({ ...row, kam: 'Bob Jones' }), false)
  assert.equal(owns({ ...row, kam: null, customer_id: 20 }), false)
  assert.equal(owns({ ...row, region_id: 2 }), false)
  assert.equal(buildKamVolumeScope('alice', null, kams, customers, keys)(row), false)
})

test('ambiguous names and unmatched labels never grant access', () => {
  const owns = buildKamVolumeScope('alice', 1, [...kams, { id: 'another-alice', full_name: 'Alice Smith', email: 'other@example.com' }], customers, new Set())
  assert.equal(owns(row), false)
  assert.equal(owns({ ...row, kam: null }), false)
  assert.equal(owns({ ...row, kam: 'alice@example.com' }), true)
  const legacy = buildKamVolumeScope('alice', 1, kams, [], new Set([JSON.stringify([1,10,100])]))
  assert.equal(legacy({ ...row, kam: null }), true)
  assert.equal(legacy({ ...row, kam: 'Vacant' }), false)
})

test('imports alone populate KAM performance and contribution totals', () => {
  const owns = buildKamVolumeScope('alice', 1, kams, customers, new Set())
  const budgets = [{ ...row, id: 1, month: 11, volume: 100 }, { ...row, id: 2, month: 11, kam: 'Bob Jones', volume: 500 }].filter(owns)
  const actuals = [row, { ...row, kam: 'Bob Jones', volume: 900 }].filter(owns)
  const labels = { regions: new Map([[1,'LUZON']]), subregions: new Map(), customers: new Map([[10,'Customer A']]), products: new Map([[100,'Product A']]) }
  const result = buildDashboardPerformance('customer', [], budgets, actuals, labels)
  assert.equal(result.length, 1)
  assert.deepEqual({ budget: result[0].budget, forecast: result[0].forecast, actual: result[0].actual }, { budget: 100, forecast: 0, actual: 30 })
  assert.equal(result[0].region, 'Customer A')
})
