import test from 'node:test'
import assert from 'node:assert/strict'
import { rsmForSubregion, rsmAssignmentKey } from '../lib/rsm-reporting.ts'

test('RSM names match both the region and assigned subregion', () => {
  const users = [
    { id: 'a', full_name: 'RSM A', region_id: 1, subregion_id: 11 },
    { id: 'b', full_name: 'RSM B', region_id: 1, subregion_id: 12 },
    { id: 'c', full_name: 'Other Region', region_id: 2, subregion_id: 11 },
  ]
  assert.equal(rsmForSubregion(1, 11, users), 'RSM A')
  assert.equal(rsmForSubregion(1, 12, users), 'RSM B')
  assert.equal(rsmForSubregion(1, null, users), 'Unassigned RSM')
  assert.equal(rsmForSubregion(1, 13, users), 'Unassigned RSM')
  assert.equal(rsmForSubregion(1, 11, [...users, { ...users[0], id: 'duplicate' }]), 'Multiple RSMs assigned')
  assert.notEqual(rsmAssignmentKey(1, 11), rsmAssignmentKey(2, 11))
})
