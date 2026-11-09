import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summaryForLevel } from '../lib/table-summary-level.ts'

test('each grouping level includes just its own unique count', () => {
  for (const level of ['rsms', 'kams', 'regions', 'subregions', 'customers', 'categories']) {
    assert.deepEqual(summaryForLevel(3, level, ['first', 'first', 'second']), { records: 3, [level]: 2 })
  }
})

test('empty identifiers do not invent people or entities', () => {
  assert.deepEqual(summaryForLevel(3, 'rsms', [null, undefined, '']), { records: 3, rsms: 0 })
  assert.deepEqual(summaryForLevel(0, 'kams', []), { records: 0, kams: 0 })
})

test('counts reflect only the supplied filtered rows', () => {
  assert.deepEqual(summaryForLevel(2, 'kams', ['alex', 'alex']), { records: 2, kams: 1 })
})
