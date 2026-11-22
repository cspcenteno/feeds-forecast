import { test } from 'node:test'
import assert from 'node:assert/strict'
import { savedForecastMatchesStatus, canEditSavedForecastStatus, canDeleteSavedForecastStatus } from '../lib/saved-forecast-status.ts'

const row = (status) => ({ status, returned_at: null })

test('Delete is available only for drafts, while returned forecasts remain editable', () => {
  assert.equal(canDeleteSavedForecastStatus('Draft'),true)
  for (const status of ['Rejected','Pending','Endorsed','Approved']) assert.equal(canDeleteSavedForecastStatus(status),false)
  assert.equal(canEditSavedForecastStatus('Rejected'),true)
})

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

test('voided forecasts are history only and cannot be edited or deleted', () => {
  assert.equal(savedForecastMatchesStatus(row('Voided'),'all'),true)
  assert.equal(savedForecastMatchesStatus(row('Voided'),'Voided'),true)
  assert.equal(savedForecastMatchesStatus(row('Voided'),''),false)
  assert.equal(savedForecastMatchesStatus(row('Voided'),'Approved'),false)
  assert.equal(canEditSavedForecastStatus('Voided'),false)
  assert.equal(canDeleteSavedForecastStatus('Voided'),false)
})
