import { test } from 'node:test'
import assert from 'node:assert/strict'
import { savedForecastMatchesStatus, canEditSavedForecastStatus } from '../lib/saved-forecast-status.ts'

const row = (status) => ({ status, returned_at: null })

test('default shows active work and excludes approved history', () => {
  for (const status of ['Draft', 'Pending', 'Endorsed', 'Rejected']) assert.equal(savedForecastMatchesStatus(row(status), ''), true)
  assert.equal(savedForecastMatchesStatus(row('Approved'), ''), false)
})

test('Approved and All statuses include approved records', () => {
  assert.equal(savedForecastMatchesStatus(row('Approved'), 'Approved'), true)
  for (const status of ['Draft', 'Pending', 'Endorsed', 'Rejected', 'Approved']) assert.equal(savedForecastMatchesStatus(row(status), 'all'), true)
  assert.equal(savedForecastMatchesStatus(row('Unknown'), 'all'), false)
})

test('approved forecasts remain read-only and returned drafts stay discoverable', () => {
  assert.equal(canEditSavedForecastStatus('Approved'), false)
  assert.equal(canEditSavedForecastStatus('Pending'), false)
  assert.equal(canEditSavedForecastStatus('Draft'), true)
  assert.equal(savedForecastMatchesStatus({status:'Draft',returned_at:'2026-11-10'}, 'Rejected'), true)
})
