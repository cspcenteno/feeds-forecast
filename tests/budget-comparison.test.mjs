import { test } from 'node:test'
import assert from 'node:assert/strict'
import { budgetComparison } from '../lib/budget-comparison.ts'

test('a valid zero stays below target when the budget is positive', () => {
  assert.deepEqual(budgetComparison(0, 100), { state: 'below', ratio: 0 })
})

test('missing values and failed numeric values are unavailable rather than zero', () => {
  for (const value of [null, undefined, NaN, Infinity, -Infinity]) {
    assert.deepEqual(budgetComparison(value, 100), { state: 'unavailable', ratio: null })
  }
})

test('a missing or nonpositive budget leaves valid values unclassified', () => {
  for (const budget of [null, undefined, 0, -10, NaN, Infinity]) {
    assert.deepEqual(budgetComparison(0, budget), { state: 'unrated', ratio: null })
    assert.deepEqual(budgetComparison(25, budget), { state: 'unrated', ratio: null })
  }
})

test('thresholds preserve fractional volumes and legitimate negative adjustments', () => {
  assert.deepEqual(budgetComparison(0.5, 0.5), { state: 'met', ratio: 100 })
  assert.equal(budgetComparison(90, 100).state, 'near')
  assert.equal(budgetComparison(89.9, 100).state, 'below')
  assert.deepEqual(budgetComparison(-10, 100), { state: 'below', ratio: -10 })
})
