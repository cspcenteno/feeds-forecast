import test from 'node:test'
import assert from 'node:assert/strict'
import { assignedForecastCustomers } from '../lib/forecast-customers.ts'

const rows = [
  { id: 1, salesman: '  Jane   Dela Cruz ' },
  { id: 2, salesman: 'Jane Dela Cruz Jr.' },
  { id: 3, salesman: 'John Santos' },
  { id: 4, salesman: null },
]
test('KAMs of every role see only exact assigned names with normalized case and spacing', () => {
  for (const role of ['User', 'Admin', 'Manager', 'Superuser', null]) {
    assert.deepEqual(assignedForecastCustomers(rows, { role, position: ' kam ', full_name: 'jane dela cruz' }).map((row) => row.id), [1])
  }
})
test('missing and unmatched KAM names never expose unassigned or other customers', () => {
  for (const full_name of [null, '', '   ', 'Unknown']) {
    assert.deepEqual(assignedForecastCustomers(rows, { role: 'User', position: 'KAM', full_name }), [])
  }
})
test('other roles and sales positions retain their existing customer scope', () => {
  for (const [role, position] of [['Admin', null], ['Manager', 'RSM'], ['Manager', 'ASM'], ['Superuser', 'Supervisor'], ['User', null]]) {
    assert.equal(assignedForecastCustomers(rows, { role, position, full_name: 'Jane Dela Cruz' }), rows)
  }
})
