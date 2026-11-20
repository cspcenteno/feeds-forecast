import test from 'node:test'
import assert from 'node:assert/strict'
import { dashboardMonthlyReferences, dashboardReferenceRowKey } from '../lib/dashboard-monthly-references.ts'
import { dashboardSalesTotals } from '../lib/dashboard-sales-totals.ts'

test('dashboard row attachment retains full parent totals while distinct customer references remain separate', () => {
  const first = { id:1,region_id:1,subregion_id:10,submitted_by:'kam-a',endorsed_by:'rsm-a',customer_id:100,product_id:1 }
  const second = {...first,id:2,customer_id:200,product_id:2}
  const references=new Map()
  for(const anchor of [first,second]) {
    for(const [level,budget] of [['asm',2000],['rsm',1500],['kam',1000],['customer',anchor.customer_id]]) {
      references.set(JSON.stringify([anchor.id,level]),{
        forecast_id:anchor.id,team_level:level,budget_volume:budget,actual_volume:50,previous_actual_volume:40,forecast_volume:30,
      })
    }
  }
  const rows=[first,second].map(anchor=>({...anchor,budget_id:null,quantity:10,volume:10,budget:0,actual:0,prior_actual:0,
    monthly_references:dashboardMonthlyReferences(anchor,references)}))
  assert.equal(dashboardSalesTotals(rows,true,'asm')[2],2000)
  assert.equal(dashboardSalesTotals(rows,true,'rsm')[2],1500)
  assert.equal(dashboardSalesTotals(rows,true,'kam')[2],1000)
  assert.equal(dashboardSalesTotals(rows,true,'customer')[2],300)
  assert.notEqual(dashboardReferenceRowKey(first),dashboardReferenceRowKey({...first,endorsed_by:'rsm-b'}))
  assert.notEqual(dashboardReferenceRowKey(first),dashboardReferenceRowKey({...first,submitted_by:'kam-b'}))
  assert.equal(dashboardMonthlyReferences(first,references).product,undefined)
})
