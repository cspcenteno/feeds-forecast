import test from 'node:test'
import assert from 'node:assert/strict'
import { importVolumeSummary } from '../lib/import-volume-summary.ts'

test('import totals reconcile volumes across readiness statuses independently of record counts', () => {
  const totals = importVolumeSummary([
    { status: 'Already imported', volume: 15776.5 },
    { status: 'Ready', volume: 13500 },
    { status: 'Invalid', volume: 49 },
    { status: 'Invalid', volume: null },
  ])
  assert.deepEqual(totals, { total: 29325.5, ready: 13500, invalid: 49, alreadyImported: 15776.5 })
  assert.equal(totals.total, totals.ready + totals.invalid + totals.alreadyImported)
})

test('all matching records have matching uploaded and already-imported volume totals', () => {
  const rows = Array.from({ length: 644 }, () => ({ status: 'Already imported', volume: 20.5 }))
  const totals = importVolumeSummary(rows)
  assert.equal(totals.total, totals.alreadyImported)
  assert.equal(totals.ready, 0)
})
