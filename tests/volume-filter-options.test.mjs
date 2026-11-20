import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { volumeFilterOptions } from '../lib/volume-filter-options.ts'

const records = [
  {region_id:1,subregion_id:11,year:2026,month:11,customer_id:1,product_id:1},
  {region_id:1,subregion_id:12,year:2026,month:11,customer_id:2,product_id:2},
  {region_id:2,subregion_id:11,year:2026,month:11,customer_id:3,product_id:3},
  {region_id:1,subregion_id:11,year:2025,month:11,customer_id:4,product_id:4},
  {region_id:1,subregion_id:11,year:2026,month:12,customer_id:5,product_id:5},
  {region_id:1,subregion_id:null,year:2026,month:11,customer_id:6,product_id:6},
]
const customers = records.map(row=>({id:row.customer_id,customer:'Customer '+row.customer_id}))
const products = new Map(records.map(row=>[row.product_id,'Product '+row.product_id]))

test('Customer and Product choices use the page role, area and selected period scope', async () => {
  const source = await readFile(new URL('../components/volume-import-page.tsx',import.meta.url),'utf8')
  const file = ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  let predicate
  function visit(node) {
    if(ts.isVariableDeclaration(node)&&node.name.getText(file)==='scopedBudgets') predicate=node.initializer.arguments[0].getText(file)
    ts.forEachChild(node,visit)
  }
  visit(file)
  assert.ok(predicate)
  const options = overrides => {
    const context={budgets:records,filterYear:'2026',filterMonth:'11',filterRegionId:'',canReadAllRegions:false,
      assignedRegionId:1,assignedSubregionId:11,subregionRestricted:true,...overrides}
    const scoped=new Function('context',`with(context){return (${predicate})()}`)(context)
    return volumeFilterOptions(scoped,customers,products)
  }
  // RSM and KAM: exact region and subregion; missing assignments fail closed.
  assert.deepEqual(options({}),{customers:['Customer 1'],products:[[1,'Product 1']]})
  assert.deepEqual(options({assignedSubregionId:null}),{customers:[],products:[]})
  assert.deepEqual(options({assignedRegionId:null}),{customers:[],products:[]})
  // ASM and Supervisor: all represented subregions in their region.
  assert.deepEqual(options({subregionRestricted:false}).customers,['Customer 1','Customer 2','Customer 6'])
  // Admin and NSM: all regions, or the selected region, within the selected period.
  assert.deepEqual(options({canReadAllRegions:true,subregionRestricted:false}).customers,['Customer 1','Customer 2','Customer 3','Customer 6'])
  assert.deepEqual(options({canReadAllRegions:true,subregionRestricted:false,filterRegionId:'2'}).products,[[3,'Product 3']])
})

test('filter options exclude absent master records and deduplicate represented customers', () => {
  const result=volumeFilterOptions([records[0],records[0],{customer_id:null,product_id:null}],
    [...customers,{id:99,customer:'Unrelated customer'}],new Map([...products,[99,'Unrelated product']]))
  assert.deepEqual(result,{customers:['Customer 1'],products:[[1,'Product 1']]})
})
