import test from 'node:test'
import assert from 'node:assert/strict'
import { importValidationGroups } from '../lib/import-validation-groups.ts'

const row = (id, kam, issues, fields = {}) => ({ source: { id, kam, customer:'SK AGRIVET SUPPLY', product_code:'P1', region:'LUZON', ...fields }, region:{id:1,name:'LUZON'}, issues })

test('customer issues group by customer and region across different salesmen, counting each row once', () => {
  const items = [1,2,3,4].map((id)=>row(id,id===4?'CHRISTIAN CENTENO':'CHRISTIAN SP. CENTENO',[
    'Customer not found: SK AGRIVET SUPPLY', 'Salesman assignment not found (KAM/RSM/ASM): '+(id===4?'CHRISTIAN CENTENO':'CHRISTIAN SP. CENTENO'),
  ]))
  const invalid = importValidationGroups(items).get('invalid')
  assert.equal(invalid.count,4)
  const customers = invalid.groups.get('customer not found')
  assert.equal(customers.count,4)
  assert.equal(customers.groups.size,1)
  assert.equal([...customers.groups.values()][0].rows.length,4)
  const salesmen = invalid.groups.get('salesman assignment not found (kam/rsm/asm)')
  assert.equal(salesmen.groups.size,2)
  assert.deepEqual([...salesmen.groups.values()].map(group=>group.count),[3,1])
})

test('same customer in separate regions remains separate', () => {
  const items = [row(1,'A',['Customer not found: SK AGRIVET SUPPLY']),{
    ...row(2,'B',['Customer not found: SK AGRIVET SUPPLY'],{region:'VISAYAS'}),region:{id:2,name:'VISAYAS'},
  }]
  assert.equal(importValidationGroups(items).get('invalid').groups.get('customer not found').groups.size,2)
})

test('product issues combine across customers, while volume issues stay per record', () => {
  const items = [row(1,'A',['Product code not found: P1','Missing volume']), row(2,'B',['Product code not found: P1','Missing volume'],{customer:'Other Customer',product_name:'Product One'})]
  const invalid = importValidationGroups(items).get('invalid')
  assert.equal(invalid.count,2)
  const products = invalid.groups.get('product code not found')
  assert.equal(products.groups.size,1)
  assert.equal([...products.groups.values()][0].kind,'product')
  assert.equal([...products.groups.values()][0].label,'Product: P1 - Product One')
  assert.equal([...products.groups.values()][0].rows.length,2)
  const volumes = invalid.groups.get('missing volume')
  assert.equal(volumes.groups.size,0)
  assert.deepEqual(volumes.rows.map(item=>item.source.id),[1,2])
})

test('valid records retain salesman grouping; repeated issues do not inflate counts', () => {
  const groups = importValidationGroups([row(1,'A',[]),row(2,' a ',[]),row(3,'B',['Invalid volume','Invalid volume'])])
  assert.equal(groups.get('valid').count,2)
  assert.equal(groups.get('valid').groups.size,1)
  assert.equal(groups.get('invalid').count,1)
  assert.equal(groups.get('invalid').groups.get('invalid volume').count,1)
})
