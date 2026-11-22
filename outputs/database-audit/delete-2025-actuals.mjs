import fs from 'node:fs'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {
  const i = line.indexOf('=')
  return [line.slice(0, i), line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2')]
}))
const base = env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/'
const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, Prefer: 'count=exact' }
const period = 'actual_date=gte.2025-01-01&actual_date=lt.2026-01-01'
async function count(table, filters = '') {
  const response = await fetch(base + table + '?select=id' + (filters ? '&' + filters : ''), { method: 'HEAD', headers, signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`${table}: count HTTP ${response.status}`)
  const range = response.headers.get('content-range')
  if (!range || !/\/\d+$/.test(range)) throw new Error('Exact count unavailable')
  return Number(range.split('/').at(-1))
}
async function inspect() {
  const [actuals, actuals2025, budgets] = await Promise.all([count('actuals'),count('actuals',period),count('budgets')])
  return { actuals, actuals2025, otherActuals: actuals - actuals2025, budgets }
}
const before = await inspect()
console.log(JSON.stringify({ before }))
if (!process.argv.includes('--delete')) process.exit(0)
// User explicitly requested deletion of all Actuals dated in 2025.
let deletionError = null
try {
  const response = await fetch(base + 'actuals?' + period, { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal,count=exact' }, signal: AbortSignal.timeout(120000) })
  if (!response.ok) throw new Error(`Delete HTTP ${response.status}: ${(await response.text()).slice(0,500)}`)
} catch (error) { deletionError = error.message }
const after = await inspect()
const report = { at: new Date().toISOString(), filter: '2025-01-01 <= actual_date < 2026-01-01', before, after, removed: before.actuals - after.actuals, deletionError }
fs.writeFileSync('outputs/database-audit/deleted-2025-actuals.json', JSON.stringify(report,null,2))
console.log(JSON.stringify(report,null,2))
if (after.actuals2025 !== 0 || after.otherActuals !== before.otherActuals || after.budgets !== before.budgets) throw new Error('Deletion verification did not match the intended scope. Inspect report before further actions.')
