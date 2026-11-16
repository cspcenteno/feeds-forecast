import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import * as CFB from 'cfb'
import { buildWeeklySalesExport } from '../lib/weekly-sales-export.ts'

const input = {
  sales: [
    { year: 2026, week: 47, region_id: 1, subregion_id: 2, product_id: 3, forecast: 12.5, asm_name: 'ASM & Co', endorsed_by: 'rsm' },
    { year: 2026, week: 47, region_id: 1, subregion_id: 4, product_id: 3, forecast: 7 },
    { year: 2027, week: 1, region_id: 1, subregion_id: 2, product_id: 5, forecast: 2 },
    { year: 2027, week: 1, region_id: 1, subregion_id: null, product_id: null, forecast: 3 },
  ],
  regions: [{ id: 1, name: 'VISAYAS' }], subregions: [{ id: 2, name: 'ILOILO' }, { id: 4, name: 'NEGROS' }],
  products: [{ id: 3, code: '010AP203', name: 'Creep' }, { id: 5, code: 'NEW-1', name: 'New feed' }],
  users: { rsm: 'RSM <One>' },
}
test('exports regional and area sheets with template totals, dates and new/unassigned products', () => {
  const bytes = buildWeeklySalesExport(input)
  const workbook = XLSX.read(bytes, { type: 'array', cellStyles: true })
  assert.deepEqual(workbook.SheetNames, ['VISAYAS', 'ILOILO', 'NEGROS', 'VISAYAS - Unassigned'])
  const sheet = workbook.Sheets.VISAYAS
  assert.equal(sheet.B3.v, 'ASM & Co')
  assert.equal(sheet.C10.v, 19.5)
  assert.equal(sheet.C9.v, 19.5)
  assert.equal(sheet.C8.v, 19.5)
  assert.equal(sheet.D8.v, 0)
  assert.equal(sheet.J8.v, 5)
  assert.equal(sheet.K8.v, 24.5)
  assert.match(sheet.C7.v, /Nov 16 - Nov 22 \(2026\)/)
  assert.match(sheet.J7.v, /Jan 4 - Jan 10 \(2027\)/)
  assert.equal(workbook.Sheets.ILOILO.B3.v, 'RSM <One>')
  assert.equal(workbook.Sheets.ILOILO.K8.v, 14.5)
  assert.equal(workbook.Sheets.NEGROS.K8.v, 7)
  assert.equal(workbook.Sheets['VISAYAS - Unassigned'].K8.v, 3)
  assert.equal(sheet.C10.t, 'n')
  assert.equal(sheet.K10.f, 'SUM(C10:J10)')
  assert.equal(sheet.C8.s.patternType, 'solid')
  assert.equal(sheet.C8.s.fgColor.rgb, '0070C0')
  assert.equal(Object.values(sheet).some((cell) => cell?.f?.includes('[1]')), false)
})
test('exports only supplied filtered records and supports five or more weeks', () => {
  const sales = Array.from({ length: 6 }, (_, i) => ({ ...input.sales[0], week: 45 + i, forecast: i + 1 }))
  const workbook = XLSX.read(buildWeeklySalesExport({ ...input, sales }), { type: 'array' })
  assert.equal(workbook.Sheets.VISAYAS.I8.v, 21)
  assert.equal(workbook.Sheets.VISAYAS.H10.v, 6)
  assert.equal(workbook.Sheets.VISAYAS.I10.f, 'SUM(C10:H10)')
  assert.deepEqual(workbook.SheetNames, ['VISAYAS', 'ILOILO'])
})
test('rejects an empty export', () => {
  assert.throws(() => buildWeeklySalesExport({ ...input, sales: [] }), /No Weekly Sales/)
})

test('selected W46–W50 includes all five weeks and only their records', () => {
  const workbook = XLSX.read(buildWeeklySalesExport({ ...input, fromWeek: '2026-W46', toWeek: '2026-W50', asmNames: { 1: 'Assigned ASM' } }), { type: 'array' })
  const sheet = workbook.Sheets.VISAYAS
  assert.equal(sheet.B3.v, 'Assigned ASM')
  assert.equal(workbook.Sheets.ILOILO.B4.v, 'Assigned ASM')
  assert.match(sheet.C7.v, /Nov 9 - Nov 15/)
  assert.match(sheet.G7.v, /Dec 7 - Dec 13/)
  assert.equal(sheet.H7.v, 'TOTAL')
  assert.deepEqual(['C8', 'D8', 'E8', 'F8', 'G8'].map((cell) => sheet[cell].v), [0, 19.5, 0, 0, 0])
  assert.equal(sheet.H8.v, 19.5)
})

test('one selected week has exactly one week column; empty ranges still export zeros', () => {
  const workbook = XLSX.read(buildWeeklySalesExport({ ...input, sales: [], fromWeek: '2026-W46', toWeek: '2026-W46', asmNames: { 1: 'Assigned ASM' } }), { type: 'array' })
  const sheet = workbook.Sheets.VISAYAS
  assert.equal(sheet.B3.v, 'Assigned ASM')
  assert.match(sheet.C7.v, /Nov 9 - Nov 15/)
  assert.equal(sheet.D7.v, 'TOTAL')
  assert.equal(sheet.C8.v, 0)
  assert.equal(sheet.D8.v, 0)
})

test('selected ranges handle ISO week 53 across years and reject invalid ranges', () => {
  const workbook = XLSX.read(buildWeeklySalesExport({ ...input, fromWeek: '2026-W53', toWeek: '2027-W01' }), { type: 'array' })
  assert.match(workbook.Sheets.VISAYAS.C7.v, /Dec 28 - Jan 3 \(2026\/2027\)/)
  assert.match(workbook.Sheets.VISAYAS.D7.v, /Jan 4 - Jan 10/)
  assert.equal(workbook.Sheets.VISAYAS.E7.v, 'TOTAL')
  assert.throws(() => buildWeeklySalesExport({ ...input, fromWeek: '2027-W53' }), /valid week range/)
  assert.throws(() => buildWeeklySalesExport({ ...input, fromWeek: '2026-W50', toWeek: '2026-W46' }), /valid week range/)
})

test('every sheet has the logo, bold merged title and merged grand total label', () => {
  const bytes = buildWeeklySalesExport({ ...input, fromWeek: '2026-W46', toWeek: '2026-W50' })
  const workbook = XLSX.read(bytes, { type: 'array' })
  const archive = CFB.read(bytes, { type: 'array' })
  const part = (path) => {
    const index = archive.FullPaths.findIndex((name) => name.endsWith(`/${path}`))
    assert.ok(index >= 0, `Missing ${path}`)
    return Uint8Array.from(archive.FileIndex[index].content)
  }
  const xml = (path) => new TextDecoder().decode(part(path))
  for (const [i, name] of workbook.SheetNames.entries()) {
    const sheet = workbook.Sheets[name]
    assert.equal(sheet.B1.v, 'WEEKLY FORECASTS')
    assert.equal(sheet.A8.v, 'GRAND TOTAL')
    assert.deepEqual(sheet['!merges'].map(XLSX.utils.encode_range), ['A1:A2', 'B1:B2', 'A8:B8'])
    assert.match(xml(`xl/worksheets/sheet${i + 1}.xml`), /<drawing r:id="rId1"\/>/)
    assert.match(xml(`xl/worksheets/_rels/sheet${i + 1}.xml.rels`), /Target="\.\.\/drawings\/drawing1.xml"/)
  }
  assert.match(xml('xl/styles.xml'), /<font><b\/><sz val="18"/)
  assert.match(xml('xl/drawings/drawing1.xml'), /<xdr:col>0<\/xdr:col>.*<xdr:row>0<\/xdr:row>/)
  assert.match(xml('xl/drawings/_rels/drawing1.xml.rels'), /Target="\.\.\/media\/weekly-sales-logo.png"/)
  assert.deepEqual([...part('xl/media/weekly-sales-logo.png').slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  assert.match(xml('[Content_Types].xml'), /ContentType="image\/png"/)
  assert.match(xml('[Content_Types].xml'), /PartName="\/xl\/drawings\/drawing1.xml"/)
})
