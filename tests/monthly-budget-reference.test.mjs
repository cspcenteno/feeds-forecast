import { test } from 'node:test'
import assert from 'node:assert/strict'
import { customerMonthlyBudgetReference, monthlyBudgetReference } from '../lib/monthly-budget-reference.ts'
const base = { year: 2026, month: 11, region_id: 1, subregion_id: 11, customer_id: 2, product_id: 3, volume: 40 }
const value = (rows, subregion = null) => monthlyBudgetReference(rows, 2026, 11, 1, subregion, 2, 3)

test('region-only Admin forecasts include imported Budget subregions', () => {
  assert.equal(value([base]), 40)
  assert.equal(value([base, { ...base, subregion_id: 12, volume: 60 }]), 100)
  assert.equal(value([base, { ...base, subregion_id: 12, volume: 60 }], 11), 40)
})
test('generic totals are fallbacks and do not double-count details', () => {
  assert.equal(value([base, { ...base, subregion_id: null, volume: 100 }]), 40)
  assert.equal(value([{ ...base, subregion_id: null, volume: 100 }], 11), 100)
  assert.equal(value([base, { ...base, customer_id: null, volume: 200 }]), 40)
})
test('monthly overrides annual per subregion and all matching monthly rows are summed', () => {
  assert.equal(value([base, { ...base, volume: 10 }, { ...base, month: null, volume: 1200 },
    { ...base, subregion_id: 12, month: null, volume: 600 }]), 100)
})
test('wrong region, customer, product and month cannot contribute', () => {
  const rows = [{ ...base, region_id: 9 }, { ...base, customer_id: 9 }, { ...base, product_id: 9 }, { ...base, month: 10 }]
  assert.equal(value(rows), 0)
})
test('customer totals include all its products without adding another customer or regional totals', () => {
  const rows = [base, { ...base, product_id: 4, volume: 60 },
    { ...base, product_id: 4, month: null, volume: 1200 },
    { ...base, customer_id: 99, volume: 500 }, { ...base, customer_id: null, volume: 900 }]
  assert.equal(customerMonthlyBudgetReference(rows, 2026, 11, 1, null, 2), 100)
  assert.equal(customerMonthlyBudgetReference(rows, 2026, 11, 1, null, null), 0)
})
