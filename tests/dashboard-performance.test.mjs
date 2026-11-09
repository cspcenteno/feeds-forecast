import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDashboardPerformance, dashboardLevel } from '../lib/dashboard-performance.ts'

test('performance granularity follows the sales position', () => {
  for (const role of ['Manager', 'Superuser']) {
    assert.equal(dashboardLevel({ role, position: 'ASM' }), 'subregion')
    assert.equal(dashboardLevel({ role, position: 'RSM' }), 'kam')
    assert.equal(dashboardLevel({ role, position: 'Supervisor' }), 'kam')
    assert.equal(dashboardLevel({ role, position: ' SV ' }), 'kam')
  }
  assert.equal(dashboardLevel({ role: 'User', position: 'KAM' }), 'customer')
  assert.equal(dashboardLevel({ role: 'User', position: null }), 'customer')
  assert.equal(dashboardLevel({ role: 'Admin', position: null }), 'company')
})

const labels = {
  regions: new Map([[1, 'North']]), subregions: new Map([[2, 'Area A'], [3, 'Area B']]),
  customers: new Map([[4, 'Customer A'], [5, 'Customer B']]), products: new Map([[6, 'P001 - Product A'], [7, 'P002 - Product B']]),
}
const base = { region_id: 1, subregion_id: 2, customer_id: 4, product_id: 6 }

test('subregional performance includes areas with Actuals but no forecasts', () => {
  const result = buildDashboardPerformance('subregion', [{ ...base, volume: 40 }], [
    { ...base, id: 1, month: 11, volume: 50 },
  ], [{ ...base, volume: 30 }, { ...base, subregion_id: 3, volume: 20 }], labels)
  assert.deepEqual(result.map(({ region, budget, forecast, actual }) => ({ region, budget, forecast, actual })), [
    { region: 'Area A', budget: 50, forecast: 40, actual: 30 },
    { region: 'Area B', budget: 0, forecast: 0, actual: 20 },
  ])
})

test('customer performance combines products and keeps customers separate', () => {
  const result = buildDashboardPerformance('customer', [
    { ...base, volume: 10 }, { ...base, volume: 5 }, { ...base, customer_id: 5, volume: 20 }, { ...base, product_id: 7, volume: 30 },
  ], [
    { ...base, id: 1, month: 11, volume: 40 },
    { ...base, product_id: 7, id: 2, month: 11, volume: 60 },
  ], [{ ...base, volume: 20 }, { ...base, product_id: 7, volume: 30 }], labels)
  assert.equal(result.length, 2)
  const customer = result.find((row) => row.region === 'Customer A')
  assert.deepEqual({ budget: customer.budget, forecast: customer.forecast, actual: customer.actual }, { budget: 100, forecast: 45, actual: 50 })
  assert.equal(result.find((row) => row.region === 'Customer B').forecast, 20)
})

test('monthly budgets override annual fallback within each exact scope', () => {
  const result = buildDashboardPerformance('subregion', [], [
    { ...base, id: 1, month: null, volume: 1200 }, { ...base, id: 2, month: 11, volume: 80 },
    { ...base, subregion_id: 3, id: 3, month: null, volume: 600 },
  ], [], labels)
  assert.deepEqual(result.map((row) => row.budget), [80, 50])
})

test('subregional totals do not double-count generic and customer budgets', () => {
  const result = buildDashboardPerformance('subregion', [], [
    { ...base, customer_id: null, id: 1, month: 11, volume: 100 },
    { ...base, id: 2, month: 11, volume: 40 },
    { ...base, customer_id: 5, id: 3, month: 11, volume: 60 },
  ], [], labels)
  assert.equal(result[0].budget, 100)
})

test('keeps unassigned dimensions and negative Actual adjustments visible', () => {
  const result = buildDashboardPerformance('subregion', [], [], [
    { ...base, subregion_id: null, volume: -10 },
  ], labels)
  assert.equal(result[0].region, 'Unassigned subregion')
  assert.equal(result[0].actual, -10)
})

test('company overview keeps named areas separate instead of an All areas bucket', () => {
  const result = buildDashboardPerformance('company', [
    { ...base, volume: 10 }, { ...base, region_id: 8, volume: 20 },
  ], [], [], { ...labels, regions: new Map([[1, 'North'], [8, 'South']]) })
  assert.deepEqual(result.map((row) => [row.region, row.forecast]), [['North', 10], ['South', 20]])
})

test('NSM sees regional performance and admins retain company visibility', () => {
  assert.equal(dashboardLevel({role:'Manager', position:'NSM'}), 'company')
  assert.equal(dashboardLevel({role:'Admin', position:'RSM'}), 'company')
})

test('KAM performance combines customer/product volumes without duplicating totals', () => {
  const rows = buildDashboardPerformance('kam', [
    {...base, submitter:'Alex', volume:20},
    {...base, product_id:7, submitter:'Alex', volume:30},
    {...base, customer_id:5, submitter:'Bea', volume:10},
  ], [{...base, id:1, month:11, kam:'Alex', volume:80}], [
    {...base, kam:'Alex', volume:40},
    {...base, customer_id:5, volume:15},
    {...base, customer_id:99, volume:5},
  ], labels)
  assert.equal(rows.find(r=>r.region==='Alex').forecast, 50)
  assert.equal(rows.find(r=>r.region==='Bea').actual, 15)
  assert.equal(rows.find(r=>r.region==='Unassigned KAM').actual, 5)
  assert.equal(rows.reduce((sum,r)=>sum+r.actual,0),60)
  assert.equal(rows.reduce((sum,r)=>sum+r.budget,0),80)
})
