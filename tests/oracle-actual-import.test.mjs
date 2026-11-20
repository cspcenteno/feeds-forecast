import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { findActualHeaderRow, parseOracleActualDate, oracleSalespersonName, resolveOracleKam } from '../lib/oracle-actual-import.ts'

test('detects Oracle column headers on row 3 and preserves the first transaction row', () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Oracle Actual Extract'], ['Report generated: 20-Nov-26'],
    ['Trx Number', 'Partynme', 'Salesperson', 'Trans Date', 'Gl Date', 'Item No', 'Description', 'Line Qty', 'At50 Kg'],
    ['1012701', 'CAMARINES VET PRO PLUS', 'MLO-AN DHAN GINO F. ABEJON', '4-Nov-26', '4-Nov-26', '010BP202', 'PROFESSIONAL HOG PRE-STARTER PELLET- 25 KGS', 40, 20],
  ])
  const row = findActualHeaderRow(sheet)
  assert.equal(row, 2)
  const data = XLSX.utils.sheet_to_json(sheet, { range: row })
  assert.equal(data.length, 1)
  assert.equal(parseOracleActualDate(data[0]['Trans Date']), '2026-11-04')
  assert.equal(data[0]['At50 Kg'], 20)
  assert.equal(data[0]['Item No'], '010BP202')
  assert.equal(oracleSalespersonName(data[0].Salesperson), 'DHAN GINO F. ABEJON')
})

test('supports existing Actual templates and finds headers after blank leading rows', () => {
  const standard = XLSX.utils.aoa_to_sheet([['Date', 'Region', 'Customer', 'Product Code', 'Volume'], ['2026-11-04', 'LUZON', 'Customer A', '001', 20]])
  assert.equal(findActualHeaderRow(standard), 0)
  const monthly = XLSX.utils.aoa_to_sheet([[], [], [], ['Year', 'Month', 'Customer', 'SKU', 'Actual (Vol.)'], [2026, 11, 'Customer A', '001', 20]])
  assert.equal(findActualHeaderRow(monthly), 3)
  assert.throws(() => findActualHeaderRow(XLSX.utils.aoa_to_sheet([['Unrelated report']])), /column headers/)
})

test('Oracle dates validate day/month/year and support two or four digit years', () => {
  assert.equal(parseOracleActualDate('4-Nov-2026'), '2026-11-04')
  assert.equal(parseOracleActualDate('29-FEB-24'), '2024-02-29')
  assert.equal(parseOracleActualDate('29-Feb-26'), null)
  assert.equal(parseOracleActualDate('31-Nov-26'), null)
  assert.equal(parseOracleActualDate('4-Foo-26'), null)
})

test('strips branch-AN prefixes generically without stripping ordinary or hyphenated names', () => {
  for (const code of ['MLO', 'ILO', 'CDO', 'GSC', 'NEW', 'ABC123']) assert.equal(oracleSalespersonName(`${code}-AN DHAN GINO F.   ABEJON`), 'DHAN GINO F. ABEJON')
  assert.equal(oracleSalespersonName('ROMAN JOSE'), 'ROMAN JOSE')
  assert.equal(oracleSalespersonName('ANA-MARIE CRUZ'), 'ANA-MARIE CRUZ')
})

test('matches one KAM assignment and rejects unknown, duplicate or unassigned regions', () => {
  const kam = { id: '1', full_name: 'DHAN GINO F. ABEJON', email: 'dhan@example.com', region_id: 1, subregion_id: 2 }
  assert.equal(resolveOracleKam('ILO-AN DHAN GINO F.  ABEJON', [kam]).region_id, 1)
  assert.throws(() => resolveOracleKam('UNKNOWN-AN SOMEONE', [kam]), /not found/)
  assert.throws(() => resolveOracleKam(kam.full_name, [kam, { ...kam, id: '2' }]), /Multiple/)
  assert.throws(() => resolveOracleKam(kam.full_name, [{ ...kam, region_id: null }]), /no assigned region/)
})
