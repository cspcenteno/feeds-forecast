import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actionGroupCount } from '../lib/action-group-count.ts'

test('group action counts measure people or customers rather than product rows', () => {
  const rows = [
    {customer_id:1,submitted_by:'kam-a',endorsed_by:'rsm-a'},
    {customer_id:1,submitted_by:'kam-a',endorsed_by:'rsm-a'},
    {customer_id:2,submitted_by:'kam-b',endorsed_by:'rsm-a'},
  ]
  assert.equal(actionGroupCount(rows,'customer'),2)
  assert.equal(actionGroupCount(rows,'kam'),2)
  assert.equal(actionGroupCount(rows,'rsm'),1)
  assert.equal(actionGroupCount(rows.slice(0,2),'customer'),1)
  assert.equal(actionGroupCount([],'customer'),0)
})

test('legacy submitter fallback and unassigned groups count consistently', () => {
  assert.equal(actionGroupCount([{user_id:'kam-a'},{submitted_by:'kam-a'},{user_id:'kam-b'}],'kam'),2)
  assert.equal(actionGroupCount([{endorsed_by:null},{endorsed_by:null}],'rsm'),1)
})
