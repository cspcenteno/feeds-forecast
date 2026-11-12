import { test } from 'node:test'
import assert from 'node:assert/strict'
import { permissionDefaultPreview } from '../lib/permission-default-preview.ts'
import { defaultPermissions } from '../lib/authorization-rules.ts'

const rows = map => Object.entries(map).map(([module, p]) => ({ module,can_view:p.view,can_add:p.add,can_edit:p.edit,can_delete:p.delete }))

test('preview names both gained and removed permissions without changing the original selections', () => {
  const current = rows(defaultPermissions('Manager','RSM'))
  const original = structuredClone(current)
  const forecast = current.find(row => row.module === 'Forecasts')
  forecast.can_add = true
  forecast.can_edit = false
  const custom = structuredClone(current)
  assert.deepEqual(permissionDefaultPreview(current,rows(defaultPermissions('Manager','RSM'))),[
    {label:'Forecasts',value:'Enable: Edit; Disable: Add'},
  ])
  assert.deepEqual(current,custom)
  assert.notDeepEqual(current,original)
})

test('matching defaults produce no changes and RSM-to-ASM removes returned forecast access', () => {
  const rsm = rows(defaultPermissions('Manager','RSM'))
  assert.deepEqual(permissionDefaultPreview(rsm,rsm),[])
  assert.deepEqual(permissionDefaultPreview(rsm,rows(defaultPermissions('Manager','ASM'))),[
    {label:'Forecasts',value:'Disable: View, Edit'},
  ])
})

test('unsupported checkbox actions never appear in the preview', () => {
  assert.deepEqual(permissionDefaultPreview([
    {module:'Dashboard',can_view:true,can_add:true,can_edit:true,can_delete:true},
  ],[
    {module:'Dashboard',can_view:true,can_add:false,can_edit:false,can_delete:false},
  ]),[])
})
