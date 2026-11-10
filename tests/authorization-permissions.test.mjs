import { test } from 'node:test'
import assert from 'node:assert/strict'
import { savedPermissions } from '../lib/authorization-rules.ts'

const grant = (module, view, edit = false) => ({ module, can_view: view, can_add: false, can_edit: edit, can_delete: false })

test('saved permissions never restore Manager module defaults for missing or denied grants', () => {
  const permissions = savedPermissions([grant('Dashboard', true), grant('Approvals', false), grant('Actual', false)])
  assert.equal(permissions.Dashboard.view, true)
  for (const module of ['Approvals', 'Budget', 'Actual']) assert.equal(permissions[module].view, false)
  assert.equal(Object.values(savedPermissions([])).some((permission) => Object.values(permission).some(Boolean)), false)
})

test('only explicit true grants count and unsupported module actions remain denied', () => {
  const permissions = savedPermissions([grant('Approvals', true, true), grant('Weekly Sales', true, true), grant('Budget', null)])
  assert.equal(permissions.Approvals.edit, true)
  assert.equal(permissions['Weekly Sales'].edit, false)
  assert.equal(permissions.Budget.view, false)
})
