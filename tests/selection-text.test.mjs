import test from 'node:test'
import assert from 'node:assert/strict'
import { selectionText, normalizeSelectionPrompt } from '../lib/selection-text.ts'

test('selection messages use the field name and correct plural', () => {
  assert.deepEqual(selectionText('Saved Forecasts region'), {
    select: 'Select region…', loading: 'Loading regions…',
    empty: 'No regions available', noMatches: 'No matching regions',
  })
  assert.equal(selectionText('Salesman').loading, 'Loading salesmen…')
  assert.equal(selectionText('Category').empty, 'No categories available')
  assert.equal(selectionText('Subregion').select, 'Select subregion…')
  assert.equal(selectionText('Status').loading, 'Loading statuses…')
})

test('prompts use consistent ellipses without changing filter or dependency messages', () => {
  assert.equal(normalizeSelectionPrompt('Select salesman'), 'Select salesman…')
  assert.equal(normalizeSelectionPrompt('Choose a region...'), 'Select region…')
  assert.equal(normalizeSelectionPrompt('Loading categories…'), 'Loading categories…')
  assert.equal(normalizeSelectionPrompt('All Salesmen'), 'All Salesmen')
  assert.equal(normalizeSelectionPrompt('No assigned region'), 'No assigned region')
})
