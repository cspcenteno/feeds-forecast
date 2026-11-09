import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reportingWeeksInMonth, weeklyBudget } from '../lib/weekly-budget.ts'

test('weekly targets divide November 2026 budget across four reporting weeks', () => {
  assert.equal(reportingWeeksInMonth(2026, 11), 4)
  assert.equal(weeklyBudget(3, 2026, 11), 0.75)
  assert.equal(weeklyBudget(100, 2026, 11), 25)
})

test('five-week months and leap years use their actual reporting week count', () => {
  assert.equal(reportingWeeksInMonth(2026, 10), 5)
  assert.equal(weeklyBudget(100, 2026, 10), 20)
  assert.equal(reportingWeeksInMonth(2024, 2), 5)
})

test('week assignment counts each reporting Thursday once across the year', () => {
  assert.equal(Array.from({ length: 12 }, (_, i) => reportingWeeksInMonth(2026, i + 1)).reduce((a, b) => a + b, 0), 53)
  assert.equal(weeklyBudget(0, 2026, 11), 0)
  assert.equal(weeklyBudget(0.5, 2026, 11), 0.125)
})
