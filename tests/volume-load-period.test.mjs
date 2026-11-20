import test from 'node:test'
import assert from 'node:assert/strict'
import { currentVolumePeriod, volumeLoadPhases } from '../lib/volume-load-period.ts'

test('year and month defaults use Singapore time at month/year boundaries', () => {
  assert.deepEqual(currentVolumePeriod(new Date('2026-10-31T16:00:00Z')), { year:'2026', month:'11' })
  assert.deepEqual(currentVolumePeriod(new Date('2026-12-31T16:00:00Z')), { year:'2027', month:'1' })
})
test('Actuals loads the selected period before all other dates', () => {
  assert.deepEqual(volumeLoadPhases(true,'2026','11'), [
    {from:'2026-11-01',to:'2026-12-01'}, {or:'actual_date.lt.2026-11-01,actual_date.gte.2026-12-01'},
  ])
  assert.equal(volumeLoadPhases(true,'2026','12')[0].to, '2027-01-01')
  assert.deepEqual(volumeLoadPhases(true,'2026','')[0], {from:'2026-01-01',to:'2027-01-01'})
})
test('Budgets prioritizes the selected year/month and keeps annual fallback rows in background', () => {
  assert.deepEqual(volumeLoadPhases(false,'2026','11'), [{year:2026,month:11},{or:'year.neq.2026,month.neq.11,month.is.null'}])
  assert.deepEqual(volumeLoadPhases(false,'2026',''), [{year:2026},{or:'year.neq.2026'}])
  assert.deepEqual(volumeLoadPhases(false,'','11'), [{month:11},{or:'month.neq.11,month.is.null'}])
  assert.deepEqual(volumeLoadPhases(false,'',''), [{}])
  assert.deepEqual(volumeLoadPhases(true,'',''), [{}])
})
