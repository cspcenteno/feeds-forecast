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
function preview(isActual, rows, budgets = [], kams = [{ id: 'a', full_name: 'KAM A', region_id: 1 }, { id: 'b', full_name: 'Other KAM', region_id: 1 }]) {
  const normalizeText = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  const context = {
    module: { exports: null }, isActual, previewRecords: rows, budgets,
    actualImportKams: kams,
    resolveOracleKam(value, users) {
      const matches = users.filter(user => normalizeText(user.full_name) === normalizeText(value))
      if (matches.length !== 1) throw new Error(matches.length ? 'Multiple KAM assignments match: ' + value : 'KAM assignment not found: ' + value)
      if (!matches[0].region_id) throw new Error('KAM has no assigned region: ' + value)
      return matches[0]
    },
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
  for (const change of [{ actual_date: '' }, { region: 'Unknown' }, { customer: 'Unknown' }, { product_code: 'Missing' }, { volume: 'wrong' }]) {
    const row = preview(true, [{ ...base, ...change }])[0]
    assert.equal(row.status, 'Invalid')
    assert.ok(row.issues.length > 0)
  }
})

test('unmatched KAMs stay in Actuals preview as Invalid without preventing valid rows', () => {
  const result = preview(true, [base, { ...base, id: 2, kam: 'Unknown salesperson', region: null }, { ...base, id: 3, kam: 'Unknown salesperson' }])
  assert.deepEqual(Array.from(result, row => row.status), ['Ready', 'Invalid', 'Invalid'])
  assert.match(result[1].issues.join('; '), /Salesman assignment not found/)
  assert.equal(result[1].source.kam, 'Unknown salesperson')
})

test('Actuals derives a missing region when a KAM becomes available and still rejects missing KAMs', () => {
  const row = preview(true, [{ ...base, region: null }])[0]
  assert.equal(row.status, 'Ready')
  assert.equal(row.source.region, 'LUZON')
  const missing = preview(true, [{ ...base, kam: null }])[0]
  assert.equal(missing.status, 'Invalid')
  assert.ok(missing.issues.includes('Missing salesman (KAM/RSM/ASM)'))
})

test('Actuals accepts RSM and ASM salespeople and derives their regions', () => {
  for (const position of ['KAM', 'RSM', 'ASM']) {
    const name = `${position} Salesperson`
    const users = [{ id: position, full_name: name, region_id: 1, subregion_id: position === 'ASM' ? null : 10, position }]
    const row = preview(true, [{ ...base, kam: name, region: null }], [], users)[0]
    assert.equal(row.status, 'Ready')
    assert.equal(row.source.region, 'LUZON')
    assert.equal(row.salesperson.position, position)
    assert.equal(row.salesperson.subregion_id, position === 'ASM' ? null : 10)
  }
})

test('Budgets still separates duplicate uploads from Already Imported records', () => {
  const uploaded = preview(false, [base, { ...base, id: 2 }])
  assert.deepEqual(Array.from(uploaded, row => row.status), ['Ready', 'Invalid'])
  assert.equal(uploaded[1].issues[0], 'Duplicate in upload')
  const saved = [{ year: 2026, month: 11, region_id: 1, customer_id: 2, product_id: 3, kam: 'KAM A' }]
  assert.equal(preview(false, [base], saved)[0].status, 'Already imported')
})
