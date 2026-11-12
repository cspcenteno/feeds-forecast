import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadSalesReferenceBudgets } from '../lib/sales-reference-records.ts'
import { customerMonthlyBudgetReference, monthlyBudgetReference } from '../lib/monthly-budget-reference.ts'

test('approval Budget lookup reads later pages and finds the November value of 40', async () => {
  const records = Array.from({ length: 1001 }, (_,index) => ({ id: index+1, year: 2026, month: index===1000 ? 11 : 1,
    region_id: 1, subregion_id: 2, customer_id: 3, product_id: 4, volume: index===1000 ? 40 : 5 }))
  const pages = []
  const client = { rpc: (method, args) => {
    assert.equal(method,'get_monthly_reference_budget_rows')
    assert.deepEqual(args, {p_module:'Approvals',p_years:[2026],p_region_ids:[1],p_customer_ids:[3]})
    let rows = records, from = 0, to = 999
    const q = { select: () => q, in: (field, values) => { rows = rows.filter((row) => values.includes(row[field])); return q },
      order: () => q, range: (a,b) => { from=a; to=b; pages.push(a); return q }, or: () => q, is: () => q,
      abortSignal: async () => ({ data: rows.slice(from,to+1), error: null }) }
    return q
  } }
  const result = await loadSalesReferenceBudgets(client,[{ year:2026,region_id:1,customer_id:3,product_id:4 }])
  assert.deepEqual(pages,[0,1000])
  assert.equal(result.data.length,1001)
  assert.equal(monthlyBudgetReference(result.data,2026,11,1,null,3,4),40)
})
test('no forecast scope does not fetch unrelated Budgets', async () => {
  assert.deepEqual(await loadSalesReferenceBudgets({ from: () => { throw new Error('Unexpected query') } },[]), { data:[],error:null })
})

test('RSM and ASM approval budgets include customer products absent from the submitted rows', async () => {
  const records = [70,100,270,90,143].map((volume,index) => ({
    id:index+1,year:2026,month:11,region_id:1,subregion_id:2,customer_id:3,product_id:index+1,volume,
  }))
  for (const view of ['RSM','ASM']) {
    const client = { rpc: () => {
      let rows = records
      const q = { select: () => q, order: () => q, range: () => q, or: () => q,
        in: (field,values) => { rows=rows.filter(row => values.includes(row[field])); return q },
        abortSignal: async () => ({data:rows,error:null}) }
      return q
    } }
    const submitted = records.slice(0,4)
    const {data,error} = await loadSalesReferenceBudgets(client,submitted)
    assert.equal(error,null)
    assert.equal(customerMonthlyBudgetReference(data,2026,11,1,null,3),673,view)
    assert.equal(submitted.reduce((sum,row) => sum + monthlyBudgetReference(data,2026,11,1,2,3,row.product_id),0),530,view)
  }
})
