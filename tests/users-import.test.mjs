import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseUserImportSheets, userImportColumns, validateUserImport, positionsForRole, positionForRole, validRolePosition } from '../lib/users-import.ts'
import * as XLSX from 'xlsx'

const refs = {
  users: [{ email: 'existing@example.com' }],
  regions: [{ id: 1, name: 'North' }, { id: 2, name: 'South' }],
  subregions: [{ id: 3, name: 'Area A', region_id: 1 }, { id: 4, name: 'Area B', region_id: 2 }],
}
const row = { id: '1', full_name: 'Person A', email: 'person@example.com', role: 'User', position: 'KAM', region_name: 'North', subregion_name: 'Area A' }
const validate = (source = row, references = refs) => validateUserImport([source], references)[0]

test('role position choices auto-select single options and require an allowed Manager position', () => {
  assert.deepEqual(positionsForRole('Manager'),['RSM','ASM','NSM'])
  assert.equal(positionForRole('User','ASM'),'KAM')
  assert.equal(positionForRole('Superuser','KAM'),'Supervisor')
  assert.equal(positionForRole('Admin','RSM'),'')
  assert.equal(positionForRole('Manager','KAM'),'')
  assert.equal(positionForRole('Manager','asm'),'ASM')
  assert.equal(validRolePosition('User','RSM'),false)
  assert.equal(validRolePosition('Superuser','KAM'),false)
  assert.equal(validRolePosition('Manager','Supervisor'),false)
  assert.equal(validRolePosition('Manager',''),false)
})

test('imports auto-pick singleton positions when blank and reject incompatible supplied positions', () => {
  assert.equal(validate({...row,position:''}).values.position,'KAM')
  assert.equal(validate({...row,role:'Superuser',position:''}).values.position,'Supervisor')
  assert.equal(validate({...row,role:'Manager',position:''}).status,'Invalid')
  assert.equal(validate({...row,position:'ASM'}).status,'Invalid')
  assert.equal(validate({...row,role:'Superuser',position:'RSM'}).status,'Invalid')
})

test('KAM and RSM accounts require an active subregion within their region', () => {
  for (const [role,position] of [['User','KAM'],['Manager','rsm']]) {
    assert.equal(validate({...row,role,position}).status,'Ready')
    const missing = validate({...row,role,position,subregion_name:''})
    assert.equal(missing.status,'Invalid')
    assert.ok(missing.issues.some(issue => issue.includes('Subregion is required')))
    assert.equal(validate({...row,role,position,subregion_name:'Area B'}).status,'Invalid')
  }
})

test('NSM permits no region while validating supplied geographic assignments', () => {
  const nsm = { ...row, role: 'Manager', position: 'nsm', region_name: '', subregion_name: '' }
  const result = validate(nsm)
  assert.equal(result.status, 'Ready')
  assert.equal(result.values.regionId, null)
  assert.equal(result.values.subregionId, null)
  assert.equal(validate({ ...nsm, region_name: 'Unknown' }).status, 'Invalid')
  assert.equal(validate({ ...nsm, subregion_name: 'Area A' }).status, 'Invalid')
  assert.equal(validate({ ...nsm, region_name: 'North', subregion_name: 'Area A' }).status, 'Ready')
  assert.equal(validate({ ...nsm, position: 'RSM' }).status, 'Invalid')
})

test('uses exactly the six file columns without account status', () => {
  assert.deepEqual([...userImportColumns], ['full_name', 'email', 'role', 'position', 'region_name', 'subregion_name'])
})

test('matches names and normalizes email, role, position and account status', () => {
  const result = validate({ ...row, email: ' PERSON@EXAMPLE.COM ', role: ' user ', position: 'kam', region_name: ' north ', subregion_name: 'area a' })
  assert.equal(result.status, 'Ready')
  assert.deepEqual(result.values, { fullName: 'Person A', email: 'person@example.com', role: 'User', position: 'KAM', regionId: 1, subregionId: 3, isActive: true })
})

test('applies the batch account status instead of a spreadsheet flag', () => {
  assert.equal(validateUserImport([row], refs, true)[0].values.isActive, true)
  assert.equal(validateUserImport([row], refs, false)[0].values.isActive, false)
  const legacy = parseUserImportSheets([{ name: 'Users', rows: [[...userImportColumns, 'is_active'], [...cells.slice(0, 6), 'FALSE']] }])
  assert.equal(validateUserImport([{ ...legacy[0], id: 'legacy' }], refs, true)[0].values.isActive, true)
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

test('supports an optional subregion for ASM and globally assigned Admin accounts', () => {
  assert.equal(validate({ ...row, role: 'Manager', position: 'ASM', subregion_name: '' }).status, 'Ready')
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
  assert.equal('is_active' in result[0], false)
})

test('accepts common header labels, capitalization, newlines and reordered columns', () => {
  const result = parseUserImportSheets([{ name: 'Users', rows: [
    ['Email Address', '\uFEFFFull\nName', 'User Role', 'Position', 'Region', 'Subregion', 'Active'],
    ['person@example.com', 'Person A', 'User', 'KAM', 'North', 'Area A', true],
  ] }])
  assert.equal(result[0].full_name, 'Person A')
  assert.equal(result[0].email, 'person@example.com')
  assert.equal('is_active' in result[0], false)
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
