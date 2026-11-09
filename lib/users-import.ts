export const userImportColumns = ['full_name', 'email', 'role', 'position', 'region_name', 'subregion_name'] as const
export type UserImportRow = Record<(typeof userImportColumns)[number], string> & { id: string }
export type UserImportReferences = {
  users: { email: string | null }[]
  regions: { id: number; name: string }[]
  subregions: { id: number; name: string; region_id: number }[]
}

const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')
const roles = ['User', 'Superuser', 'Manager', 'Admin'] as const

export function parseUserImportSheets(sheets: { name: string; rows: unknown[][] }[]) {
  const headerKey = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const aliases: Record<(typeof userImportColumns)[number], string[]> = {
    full_name: ['fullname', 'name', 'employeename'],
    email: ['email', 'emailaddress'],
    role: ['role', 'userrole'],
    position: ['position', 'jobposition'],
    region_name: ['regionname', 'region'],
    subregion_name: ['subregionname', 'subregion'],
  }
  let best: { count: number; sheet: string; row: number; missing: string[] } | null = null
  let emptyHeaderFound = false
  for (const sheet of sheets) {
    for (let index = 0; index < sheet.rows.length; index++) {
      const header = sheet.rows[index].map(headerKey)
      const columns = userImportColumns.map((column) => header.findIndex((cell) => aliases[column].includes(cell)))
      const missing = userImportColumns.filter((_, column) => columns[column] < 0)
      const count = userImportColumns.length - missing.length
      if (!best || count > best.count) best = { count, sheet: sheet.name, row: index + 1, missing }
      if (missing.length) continue
      if (new Set(columns).size !== userImportColumns.length) continue
      const data = sheet.rows.slice(index + 1).filter((row) =>
        columns.some((column) => String(row[column] ?? '').trim() !== '') &&
        !userImportColumns.every((field, column) => aliases[field].includes(headerKey(row[columns[column]])))
      )
      if (!data.length) { emptyHeaderFound = true; continue }
      return data.map((row) => Object.fromEntries(userImportColumns.map((column, field) =>
        [column, String(row[columns[field]] ?? '').trim()]
      )) as Omit<UserImportRow, 'id'>)
    }
  }
  if (emptyHeaderFound) throw new Error('The user column headers were found, but there are no user records below them.')
  if (best && best.count > 0) throw new Error(`Missing columns: ${best.missing.join(', ')}. Closest header found in "${best.sheet}", row ${best.row}.`)
  throw new Error('No user header row was found in any worksheet. Expected: ' + userImportColumns.join(', ') + '.')
}

export function validateUserImport(rows: UserImportRow[], refs: UserImportReferences, isActive = true) {
  const existing = new Set(refs.users.map((user) => user.email?.trim().toLowerCase()))
  const seen = new Set<string>()
  return rows.map((source) => {
    const issues: string[] = []
    const fullName = source.full_name.trim()
    const email = source.email.trim().toLowerCase()
    const role = roles.find((item) => item.toLowerCase() === normalize(source.role)) ?? null
    const position = ['KAM', 'RSM', 'ASM', 'NSM', 'Supervisor'].find((item) => item.toLowerCase() === normalize(source.position)) ?? source.position.trim()
    if (!fullName || fullName.length > 150) issues.push('Full name is required and must be at most 150 characters.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) issues.push('Enter a valid email address.')
    if (!role) issues.push('Role must be User, Superuser, Manager, or Admin.')
    if (position.length > 150) issues.push('Position must be at most 150 characters.')
    const regionMatches = refs.regions.filter((item) => normalize(item.name) === normalize(source.region_name) && Boolean(source.region_name.trim()))
    const region = regionMatches.length === 1 ? regionMatches[0] : null
    const subregionMatches = refs.subregions.filter((item) => item.region_id === region?.id && normalize(item.name) === normalize(source.subregion_name))
    const subregion = subregionMatches.length === 1 ? subregionMatches[0] : null
    if (role === 'Admin') {
      if (source.region_name.trim() || source.subregion_name.trim()) issues.push('Leave region and subregion blank for Admin accounts.')
    } else {
      if (!region) issues.push('Region name is required and must match one active region.')
      if (source.subregion_name.trim() && !subregion) issues.push('Subregion must match one active subregion in the selected region.')
    }
    const status = issues.length ? 'Invalid' : existing.has(email) ? 'Already exists' : seen.has(email) ? 'Duplicate in file' : 'Ready'
    if (!issues.length) seen.add(email)
    return { source, issues, status, values: { fullName, email, role, position, isActive, regionId: role === 'Admin' ? null : region?.id ?? null, subregionId: role === 'Admin' ? null : subregion?.id ?? null } }
  })
}
