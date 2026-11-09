import { test } from 'node:test'
import assert from 'node:assert/strict'
import { uniqueReturnNotices } from '../lib/return-notices.ts'

const notice = { reviewer: 'Xerxes', returnedBy: 'reviewer-id', returnedAt: '2026-11-10T04:04:00Z', reason: 'Reforecast' }

test('products returned together produce one notice', () => {
  assert.deepEqual(uniqueReturnNotices([notice, { ...notice }, { ...notice }]), [notice])
})

test('different reasons, reviewers or return events remain visible', () => {
  assert.equal(uniqueReturnNotices([notice, { ...notice, reason: 'Correct quantity' }, { ...notice, returnedBy: 'other' }, { ...notice, returnedAt: '2026-11-11T04:04:00Z' }]).length, 4)
})
