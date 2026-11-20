import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dashboardSalesTotals } from '../lib/dashboard-sales-totals.ts'

const row = {region_id:1,customer_id:10,product_id:1,budget_id:1,quantity:10,volume:10,budget:90,actual:0,prior_actual:40,
  customer_budget:673,customer_actual:12,customer_prior_actual:530,customer_forecast:137}

test('customer summaries use full customer references once across listed products', () => {
  const rows = [row,{...row,product_id:2,budget_id:2,quantity:20,volume:20,budget:100,prior_actual:50}]
  assert.deepEqual(dashboardSalesTotals(rows,true),[30,30,673,12,530,137])
  assert.deepEqual(dashboardSalesTotals([row],false),[10,10,90,0,40,10])
})

test('higher summaries deduplicate each customer and include different customers independently', () => {
  const other = {...row,customer_id:11,customer_budget:100,customer_actual:5,customer_prior_actual:20,customer_forecast:15}
  assert.deepEqual(dashboardSalesTotals([row,{...row,volume:5,quantity:5},other],true),[25,25,773,17,550,152])
})

test('hierarchy references include undisplayed customers without multiplying totals across products', () => {
  const monthly_references = Object.fromEntries([
    ['asm',2000],['rsm',1500],['kam',1000],['customer',673],['product',90],
  ].map(([level,budget]) => [level,{ scope_key:level+'-one',budget,actual:budget/2,previous_actual:budget/4,forecast:budget/10 }]))
  const rows=[{...row,monthly_references},{...row,product_id:2,quantity:20,volume:20,monthly_references}]
  for(const [level,budget] of [['asm',2000],['rsm',1500],['kam',1000],['customer',673]]) {
    assert.deepEqual(dashboardSalesTotals(rows,true,level),[30,30,budget,budget/2,budget/4,budget/10])
  }
  const secondRegion={...row,region_id:2,monthly_references:{asm:{...monthly_references.asm,scope_key:'asm-two',budget:500}}}
  assert.equal(dashboardSalesTotals([...rows,secondRegion],true,'asm')[2],2500)
})

test('missing group references show unavailable values instead of partial descendant totals', () => {
  const totals=dashboardSalesTotals([row],true,'rsm')
  assert.deepEqual(totals.slice(0,2),[10,10])
  assert.ok(totals.slice(2).every(Number.isNaN))
})
