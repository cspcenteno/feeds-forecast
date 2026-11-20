const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const source = ts.createSourceFile('table.tsx', fs.readFileSync('components/ui/table.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let update
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'updateWidth') update = node.initializer
  ts.forEachChild(node, visit)
}
visit(source)
const code = ts.transpileModule('module.exports = ' + update.getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText

function align({ width = 1200, columnRight = 700, padding = 6, column = 3 } = {}) {
  let inset
  const header = { paddingRight: String(padding), getBoundingClientRect: () => ({ right: columnRight }) }
  const headers = Array.from({ length: 8 }, () => ({ paddingRight: '6', getBoundingClientRect: () => ({ right: 100 }) }))
  headers[column ?? 7] = header
  const summary = { paddingRight: '16', getBoundingClientRect: () => ({ right: 1200 }) }
  const container = {
    clientWidth: width,
    style: { setProperty() {} },
    closest: () => null,
    querySelector: () => ({ children: headers }),
  }
  const end = { parentElement: summary, style: { setProperty(_name, value) { inset = parseFloat(value) } } }
  const context = { module: { exports: null }, container, summaryEndRef: { current: end }, summaryAlignColumn: column ?? undefined, getComputedStyle: element => element }
  vm.runInNewContext(code, context)
  context.module.exports()
  return 1200 - 16 - inset
}

test('Grand Total tracks its column when expanded rows introduce a vertical scrollbar', () => {
  assert.equal(align(), 700 - 6)
  assert.equal(align({ width: 1183, columnRight: 690 }), 690 - 6)
  assert.equal(align(), 700 - 6)
})

test('Grand Total follows column positions after resizing or horizontal scrolling', () => {
  assert.equal(align({ width: 900, columnRight: 520 }), 520 - 6)
  assert.equal(align({ width: 900, columnRight: 420 }), 420 - 6)
})

test('last-column totals account for scrollbar width and different footer padding', () => {
  assert.equal(align({ column: null, columnRight: 1200, padding: 12 }), 1200 - 12)
  assert.equal(align({ column: null, width: 1183, columnRight: 1183, padding: 12 }), 1183 - 12)
})
