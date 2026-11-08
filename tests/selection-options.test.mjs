import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as el, Fragment } from 'react'
import { collectSelectionOptions, isSelectionAllowed } from '../lib/selection-options.ts'

test('selection options preserve numeric IDs, labels and empty filter values', () => {
  assert.deepEqual(collectSelectionOptions([
    el('option', { value: '' }, 'All regions'),
    el('option', { value: 0 }, 'Zero'),
    el('option', { value: 12 }, ['R12', ' — ', 'North']),
  ]), [
    { value: '', label: 'All regions', disabled: undefined },
    { value: '0', label: 'Zero', disabled: undefined },
    { value: '12', label: 'R12 — North', disabled: undefined },
  ])
})

test('mapped suggestions and fragments retain disabled choices and deduplicate values', () => {
  const options = collectSelectionOptions(el(Fragment, null,
    el('option', { value: 'Vacant' }),
    el('option', { value: 'Vacant' }),
    el('optgroup', { disabled: true }, el('option', { value: 'old' }, 'Previous region')),
  ))
  assert.equal(options.length, 2)
  assert.equal(options[0].label, 'Vacant')
  assert.equal(options[1].disabled, true)
})

test('fixed selections reject unknown or disabled values while grouping text remains unrestricted', () => {
  const options = [{ value: 'Admin', label: 'Admin' }, { value: 'old', label: 'Old', disabled: true }]
  assert.equal(isSelectionAllowed('Admin', options), true)
  assert.equal(isSelectionAllowed('', options), false)
  assert.equal(isSelectionAllowed('old', options), false)
  assert.equal(isSelectionAllowed('Random', options), false)
  assert.equal(isSelectionAllowed('Vacant / New team', options, true), true)
  assert.equal(isSelectionAllowed('', [{ value: '', label: 'All regions' }]), true)
})
