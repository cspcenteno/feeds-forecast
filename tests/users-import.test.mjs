import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseUserImportSheets, userImportColumns, validateUserImport } from '../lib/users-import.ts'
import * as XLSX from 'xlsx'

const refs = {
  users: [{ email: 'existing@example.com' }],
  regions: [{ id: 1, name: 'North' }, { id: 2, name: 'South' }],
  subregions: [{ id: 3, name: 'Area A', region_id: 1 }, { id: 4, name: 'Area B', region_id: 2 }],
}
const row = { id: '1', full_name: 'Person A', email: 'person@example.com', role: 'User', position: 'KAM', region_name: 'North', subregion_name: 'Area A', is_active: 'TRUE' }
const validate = (source = row, references = refs) => validateUserImport([source], references)[0]

test('uses exactly the requested seven file columns', () => {
  assert.deepEqual([...userImportColumns], ['full_name', 'email', 'role', 'position', 'region_name', 'subregion_name', 'is_active'])
})

test('matches names and normalizes email, role, position and account status', () => {
  const result = validate({ ...row, email: ' PERSON@EXAMPLE.COM ', role: ' user ', position: 'kam', region_name: ' north ', subregion_name: 'area a' })
  assert.equal(result.status, 'Ready')
  assert.deepEqual(result.values, { fullName: 'Person A', email: 'person@example.com', role: 'User', position: 'KAM', regionId: 1, subregionId: 3, isActive: true })
})

test('all supported active and inactive flags preserve the requested account state', () => {
  for (const value of ['TRUE', 'Yes', '1', 'Active']) assert.equal(validate({ ...row, is_active: value }).values.isActive, true)
  for (const value of ['FALSE', 'No', '0', 'Inactive']) assert.equal(validate({ ...row, is_active: value }).values.isActive, false)
  assert.equal(validate({ ...row, is_active: '' }).status, 'Invalid')
  assert.equal(validate({ ...row, is_active: 'maybe' }).status, 'Invalid')
})

test('skips existing accounts and case-insensitive duplicate emails', () => {
  assert.equal(validate({ ...row, email: 'EXISTING@example.com' }).status, 'Already exists')
  const results = validateUserImport([row, { ...row, id: '2', email: 'PERSON@EXAMPLE.COM' }], refs)
  assert.deepEqual(results.map((item) => item.status), ['Ready', 'Duplicate in file'])
})

test('rejects unknown or ambiguous regions and cross-region subregions', () => {
  assert.equal(validate({ ...row, region_name: 'Unknown' }).status, 'Invalid')
  assert.equal(validate({ ...row, subregion_name: 'Area B' }).status, 'Invalid')
  assert.equal(validate(row, { ...refs, regions: [...refs.regions, { id: 5, name: 'North' }] }).status, 'Invalid')
})

test('supports an optional subregion and globally assigned Admin accounts', () => {
  assert.equal(validate({ ...row, subregion_name: '' }).status, 'Ready')
  const admin = validate({ ...row, role: 'admin', region_name: '', subregion_name: '' })
  assert.equal(admin.status, 'Ready')
  assert.equal(admin.values.regionId, null)
  assert.equal(admin.values.subregionId, null)
  assert.equal(validate({ ...row, role: 'Admin' }).status, 'Invalid')
})

test('validates identity fields and rejects unsupported roles', () => {
  for (const change of [{ full_name: '' }, { email: 'invalid-email' }, { role: 'Owner' }, { position: 'a'.repeat(151) }]) {
    assert.equal(validate({ ...row, ...change }).status, 'Invalid')
  }
})

const cells = ['Person A', 'person@example.com', 'User', 'KAM', 'North', 'Area A', 'TRUE']

test('finds the header below title rows in a later worksheet', () => {
  const result = parseUserImportSheets([
    { name: 'Instructions', rows: [['New user upload instructions']] },
    { name: 'Users', rows: [['November new users'], [], [...userImportColumns], cells] },
  ])
  assert.equal(result.length, 1)
  assert.equal(result[0].full_name, 'Person A')
  assert.equal(result[0].is_active, 'TRUE')
})

test('accepts common header labels, capitalization, newlines and reordered columns', () => {
  const result = parseUserImportSheets([{ name: 'Users', rows: [
    ['Email Address', '\uFEFFFull\nName', 'User Role', 'Position', 'Region', 'Subregion', 'Active'],
    ['person@example.com', 'Person A', 'User', 'KAM', 'North', 'Area A', true],
  ] }])
  assert.equal(result[0].full_name, 'Person A')
  assert.equal(result[0].email, 'person@example.com')
  assert.equal(result[0].is_active, 'true')
})

test('skips blank rows and repeated headers while retaining incomplete user records', () => {
  const result = parseUserImportSheets([{ name: 'Users', rows: [[...userImportColumns], cells, [], [...userImportColumns], ['Missing email']] }])
  assert.equal(result.length, 2)
  assert.equal(result[1].email, '')
  assert.equal(validateUserImport([{ ...result[1], id: '2' }], refs)[0].status, 'Invalid')
})

test('distinguishes missing headers, partial headers and an empty template', () => {
  assert.throws(() => parseUserImportSheets([{ name: 'Wrong file', rows: [['Unrelated data']] }]), /No user header row/)
  assert.throws(() => parseUserImportSheets([{ name: 'Users', rows: [['full_name', 'email'], ['A', 'a@example.com']] }]), /Closest header found.*row 1/)
  assert.throws(() => parseUserImportSheets([{ name: 'Template', rows: [[...userImportColumns]] }]), /no user records/)
})

test('reads formatted Excel cells and CSV using the same header detection', () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Users to create'], [], [...userImportColumns], cells]), 'Users')
  for (const bookType of ['xlsx', 'csv']) {
    const parsed = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType }), { type: 'buffer' })
    const result = parseUserImportSheets(parsed.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(parsed.Sheets[name], { header: 1, defval: '', raw: false, blankrows: true }) })))
    assert.equal(result[0].email, 'person@example.com')
  }
})
