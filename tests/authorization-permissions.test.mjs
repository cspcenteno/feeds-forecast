import { test } from 'node:test'
import assert from 'node:assert/strict'
import { savedPermissions } from '../lib/authorization-rules.ts'

const grant = (module, view, edit = false) => ({ module, can_view: view, can_add: false, can_edit: edit, can_delete: false })

test('saved permissions never restore Manager module defaults for missing or denied grants', () => {
  const permissions = savedPermissions([grant('Dashboard', true), grant('Approvals', false), grant('Actuals', false)])
  assert.equal(permissions.Dashboard.view, true)
  for (const module of ['Approvals', 'Budgets', 'Actuals']) assert.equal(permissions[module].view, false)
  assert.equal(Object.values(savedPermissions([])).some((permission) => Object.values(permission).some(Boolean)), false)
})

test('only explicit true grants count and unsupported module actions remain denied', () => {
  const permissions = savedPermissions([grant('Approvals', true, true), grant('Weekly Sales', true, true), grant('Budgets', null)])
  assert.equal(permissions.Approvals.edit, true)
  assert.equal(permissions['Weekly Sales'].edit, false)
  assert.equal(permissions.Budgets.view, false)
})

test('Export is independent of Edit, requires View and is supported only for Weekly Sales', () => {
  for (const [view, canExport, expected] of [[true, true, true], [true, false, false], [false, true, false], [true, undefined, false]]) {
    const permissions = savedPermissions([
      { ...grant('Weekly Sales', view), can_export: canExport },
      { ...grant('Products', true, true), can_export: true },
    ])
    assert.equal(permissions['Weekly Sales'].export, expected)
    assert.equal(permissions['Weekly Sales'].edit, false)
    assert.equal(permissions.Products.export, false)
    assert.equal(permissions.Products.edit, true)
  }
})


test('Import requires explicit permission and View and is limited to supported modules', () => {
  for (const module of ['Forecasts', 'Actuals', 'Budgets', 'Users', 'Products', 'Weekly Sales']) {
    for (const view of [false, true]) {
      for (const canImport of [undefined, false, true]) {
        const permissions = savedPermissions([{ ...grant(module, view), can_import: canImport }])
        assert.equal(permissions[module].import, ['Forecasts', 'Actuals', 'Budgets', 'Users'].includes(module) && view && canImport === true)
      }
    }
  }
})
