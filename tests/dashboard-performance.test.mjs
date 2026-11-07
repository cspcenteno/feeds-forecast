import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDashboardPerformance, dashboardLevel } from '../lib/dashboard-performance.ts'

test('performance granularity follows the sales position', () => {
  for (const role of ['Manager', 'Superuser']) {
    assert.equal(dashboardLevel({ role, position: 'ASM' }), 'region')
    assert.equal(dashboardLevel({ role, position: 'RSM' }), 'subregion')
    assert.equal(dashboardLevel({ role, position: 'Supervisor' }), 'subregion')
    assert.equal(dashboardLevel({ role, position: ' SV ' }), 'subregion')
  }
  assert.equal(dashboardLevel({ role: 'User', position: 'KAM' }), 'customer-product')
  assert.equal(dashboardLevel({ role: 'User', position: null }), 'customer-product')
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

test('customer/product performance separates customers and products', () => {
  const result = buildDashboardPerformance('customer-product', [
    { ...base, volume: 10 }, { ...base, volume: 5 }, { ...base, customer_id: 5, volume: 20 }, { ...base, product_id: 7, volume: 30 },
  ], [], [], labels)
  assert.equal(result.length, 3)
  assert.equal(result.find((row) => row.region === 'Customer A / P001 - Product A').forecast, 15)
  assert.equal(result.find((row) => row.region === 'Customer B / P001 - Product A').forecast, 20)
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
