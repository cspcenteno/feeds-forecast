import { test } from 'node:test'
import assert from 'node:assert/strict'
import { referencePeriod } from '../lib/reference-period.ts'

test('previous month remains in the same year outside January', () => {
  assert.deepEqual(referencePeriod(2026, 11, true), { year: 2026, month: 10 })
  assert.deepEqual(referencePeriod(2026, 2, true), { year: 2026, month: 1 })
})

test('January references December of the preceding year', () => {
  assert.deepEqual(referencePeriod(2026, 1, true), { year: 2025, month: 12 })
})

test('current month is unchanged', () => {
  assert.deepEqual(referencePeriod(2026, 11), { year: 2026, month: 11 })
})
