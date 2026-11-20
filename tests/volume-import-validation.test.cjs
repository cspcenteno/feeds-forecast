const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const source = ts.createSourceFile('volume-import-page.tsx', fs.readFileSync('components/volume-import-page.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let callback
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'importPreview') callback = node.initializer.arguments[0]
  ts.forEachChild(node, visit)
}
visit(source)
const code = ts.transpileModule('module.exports = ' + callback.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText

const base = { id: 1, actual_date: '2026-11-04', year: '2026', month: '11', region: 'LUZON', customer: 'Customer A', product_code: '001', kam: 'KAM A', volume: '20' }
function preview(isActual, rows, budgets = []) {
  const normalizeText = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  const context = {
    module: { exports: null }, isActual, previewRecords: rows, budgets,
    regions: [{ id: 1, name: 'LUZON', code: 'LZ' }],
    customers: [{ id: 2, customer: 'Customer A', region_id: 1 }],
    products: [{ id: 3, code: '001', name: 'Product A', category_id: 4 }],
    normalizeText,
    parseActualDate: value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value : null,
    parseMonth: value => Number(value) >= 1 && Number(value) <= 12 ? Number(value) : null,
    getBudgetImportKey: (year, month, region, customer, product, kam) => [year, month, region, customer, product, normalizeText(kam)].join('|'),
  }
  vm.runInNewContext(code, context)
  return context.module.exports()
}

test('Actuals retains additional sales on the same daily key with different volumes', () => {
  const saved = [{ actual_date: '2026-11-04', region_id: 1, customer_id: 2, product_id: 3, kam: 'KAM A', volume: 10 }]
  const rows = preview(true, [base, { ...base, id: 2, volume: '15' }], saved)
  assert.deepEqual(Array.from(rows, row => row.status), ['Ready', 'Ready'])
})

test('Actuals matches saved rows including volume and KAM, using each saved row once', () => {
  const saved = [{ actual_date: '2026-11-04', region_id: 1, customer_id: 2, product_id: 3, kam: 'KAM A', volume: 20 }]
  const result = preview(true, [base, { ...base, id: 2 }, { ...base, id: 3, kam: 'Other KAM' }], saved)
  assert.deepEqual(Array.from(result, row => row.status), ['Already imported', 'Ready', 'Ready'])
  const october = [{ ...saved[0], actual_date: '2026-10-04' }]
  assert.equal(preview(true, [base], october)[0].status, 'Ready')
})

test('repeated valid Actuals rows within an upload stay Ready when no saved rows match', () => {
  assert.deepEqual(Array.from(preview(true, [base, { ...base, id: 2 }]), row => row.status), ['Ready', 'Ready'])
})

test('Actuals retains Invalid checks for bad dates, region/customer/product matches and volume', () => {
  for (const change of [{ actual_date: '' }, { region: '' }, { customer: 'Unknown' }, { product_code: 'Missing' }, { volume: 'wrong' }]) {
    const row = preview(true, [{ ...base, ...change }])[0]
    assert.equal(row.status, 'Invalid')
    assert.ok(row.issues.length > 0)
  }
})

test('Budgets still separates duplicate uploads from Already Imported records', () => {
  const uploaded = preview(false, [base, { ...base, id: 2 }])
  assert.deepEqual(Array.from(uploaded, row => row.status), ['Ready', 'Invalid'])
  assert.equal(uploaded[1].issues[0], 'Duplicate in upload')
  const saved = [{ year: 2026, month: 11, region_id: 1, customer_id: 2, product_id: 3, kam: 'KAM A' }]
  assert.equal(preview(false, [base], saved)[0].status, 'Already imported')
})
