import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultPermissions, disabledPermissions, savedPermissions } from '../lib/authorization-rules.ts'

test('KAM defaults allow forecast entry and draft deletion without approval privileges', () => {
  const p = defaultPermissions('User','KAM')
  assert.deepEqual(p['Forecasts'],{view:true,add:true,edit:true,delete:true})
  assert.equal(p.Dashboard.view,true)
  assert.equal(p['Weekly Sales'].view,true)
  assert.deepEqual(p.Approvals,{view:false,add:false,edit:false,delete:false})
})

test('RSM and ASM defaults differ only in returned forecast access', () => {
  const rsm = defaultPermissions('Manager',' rsm ')
  const asm = defaultPermissions('Manager','ASM')
  assert.deepEqual(rsm['Forecasts'],{view:true,add:false,edit:true,delete:false})
  assert.deepEqual(asm['Forecasts'],{view:false,add:false,edit:false,delete:false})
  for (const p of [rsm,asm]) {
    for (const module of ['Dashboard','Weekly Sales','Budgets','Actuals']) {
      assert.deepEqual(p[module],{view:true,add:false,edit:false,delete:false})
    }
    assert.deepEqual(p.Approvals,{view:true,add:false,edit:true,delete:false})
  }
})

test('Superuser defaults remain focused on customer and volume management', () => {
  const p = defaultPermissions('Superuser','Supervisor')
  for (const module of ['Customers','Budgets','Actuals','Week Locks']) {
    assert.deepEqual(p[module],{view:true,add:true,edit:true,delete:false})
  }
  assert.equal(p.Products.view,true)
  assert.equal(p['Forecasts'].view,false)
})

test('Manager NSM defaults select only Dashboard and Weekly Sales View', () => {
  const p = defaultPermissions('Manager',' nsm ')
  for (const [module, actions] of Object.entries(p)) {
    assert.deepEqual(actions, { view: ['Dashboard','Weekly Sales'].includes(module), add:false, edit:false, delete:false })
  }
})

test('Admin defaults enable supported actions while unsupported checkboxes stay disabled', () => {
  const p = defaultPermissions('Admin')
  for (const [module,actions] of Object.entries(p)) {
    for (const [action,value] of Object.entries(actions)) {
      assert.equal(value,!(disabledPermissions[module] ?? []).includes(action),`${module}: ${action}`)
    }
  }
})

test('position defaults never override explicit saved permissions or grant a different role privileges', () => {
  assert.equal(defaultPermissions('User','RSM').Approvals.edit,false)
  assert.deepEqual(savedPermissions([{module:'Forecasts',can_view:true,can_add:false,can_edit:false,can_delete:false}])['Forecasts'],
    {view:true,add:false,edit:false,delete:false})
})
