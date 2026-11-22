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

test('Salesman selection narrows accessible rows and their customer/product choices', async () => {
  const source = await readFile(new URL('../components/volume-import-page.tsx', import.meta.url), 'utf8')
  const file = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let predicate, normalize
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'salesmanScopedBudgets') predicate = node.initializer.arguments[0].getText(file)
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'normalizeText') normalize = node.getText(file)
    ts.forEachChild(node, visit)
  }
  visit(file)
  const javascript = ts.transpileModule(normalize, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const scopedBudgets = [{ ...records[0], kam: 'Alice' }, { ...records[1], kam: 'Bob' }, { ...records[5], kam: null }]
  const select = filterSalesman => new Function('scopedBudgets', 'filterSalesman', `${javascript}; return (${predicate})()`)(scopedBudgets, filterSalesman)
  assert.deepEqual(select('').map(row => row.customer_id), [1, 2, 6])
  assert.deepEqual(select(' ALICE ').map(row => row.customer_id), [1])
  assert.deepEqual(volumeFilterOptions(select('Bob'), customers, products), { customers: ['Customer 2'], products: [[2, 'Product 2']] })
  assert.deepEqual(select('Unavailable salesman'), [])
})

test('Salesman dropdown is rendered between Region and customer search', async () => {
  const source = await readFile(new URL('../components/volume-import-page.tsx', import.meta.url), 'utf8')
  const file = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let dropdown
  function visit(node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(file) === 'SelectionField' && node.attributes.properties.some(prop => prop.name?.getText(file) === 'id' && prop.initializer?.text === 'saved-volume-salesman-filter')) dropdown = node
    ts.forEachChild(node, visit)
  }
  visit(file)
  assert.ok(dropdown, 'Salesman dropdown must be present in the rendered JSX')
  assert.match(dropdown.getText(file), /value=\{filterSalesman\}/)
  assert.match(dropdown.parent.getText(file), /savedSalesmanOptions\.map/)
  assert.ok(dropdown.pos < source.indexOf('<label htmlFor="saved-budget-customer-search"'))
})
