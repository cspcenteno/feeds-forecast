import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadSalesReferenceBudgets } from '../lib/sales-reference-records.ts'
import { monthlyBudgetReference } from '../lib/monthly-budget-reference.ts'

test('approval Budget lookup reads later pages and finds the November value of 40', async () => {
  const records = Array.from({ length: 1001 }, (_,index) => ({ id: index+1, year: 2026, month: index===1000 ? 11 : 1,
    region_id: 1, subregion_id: 2, customer_id: 3, product_id: 4, volume: index===1000 ? 40 : 5 }))
  const pages = []
  const client = { from: (table) => {
    assert.equal(table,'budgets')
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
