import fs from 'node:fs'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {
  const i = line.indexOf('=')
  return [line.slice(0, i), line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2')]
}))
const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY }
async function rows(table, select) {
  const result = []
  for (let offset = 0; ; offset += 1000) {
    const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?select=${select}&order=id&offset=${offset}&limit=1000`, { headers, signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error(`${table}: HTTP ${response.status}`)
    const batch = await response.json()
    result.push(...batch)
    if (batch.length < 1000) return result
  }
}
const normalize = value => (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
const users = await rows('users', 'id,full_name,is_active,region_id')
const report = { inspectedAt: new Date().toISOString(), tables: [] }
for (const table of ['actuals', 'budgets']) {
  const saved = await rows(table, 'id,kam,region_id,' + (table === 'actuals' ? 'actual_date' : 'year,month'))
  const groups = new Map()
  for (const row of saved) {
    const key = JSON.stringify([row.kam, row.region_id])
    if (!groups.has(key)) groups.set(key, { name: row.kam, regionId: row.region_id, rows: 0, periods: {} })
    groups.get(key).rows++
    const period = table === 'actuals' ? row.actual_date?.slice(0, 7) ?? 'No date' : `${row.year}-${row.month == null ? 'Annual' : String(row.month).padStart(2, '0')}`
    groups.get(key).periods[period] = (groups.get(key).periods[period] ?? 0) + 1
  }
  const summary = { table, totalRows: saved.length, matchedRows: 0, unmatchedRows: 0, ambiguousRows: 0, blankRows: 0, inactiveUserRows: 0, differentRegionRows: 0, issues: [] }
  for (const group of groups.values()) {
    const matches = users.filter(user => normalize(group.name) && normalize(user.full_name) === normalize(group.name))
    if (!normalize(group.name)) summary.blankRows += group.rows
    else if (!matches.length) summary.unmatchedRows += group.rows
    else if (matches.length > 1) summary.ambiguousRows += group.rows
    else {
      summary.matchedRows += group.rows
      if (!matches[0].is_active) summary.inactiveUserRows += group.rows
      if (matches[0].region_id !== group.regionId) summary.differentRegionRows += group.rows
    }
    if (matches.length !== 1 || !matches[0].is_active || matches[0].region_id !== group.regionId) summary.issues.push({ ...group, matchingUsers: matches.map(({ full_name, is_active, region_id }) => ({ full_name, is_active, region_id })) })
  }
  report.tables.push(summary)
}
fs.writeFileSync('outputs/database-audit/saved-salesman-name-matches.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
