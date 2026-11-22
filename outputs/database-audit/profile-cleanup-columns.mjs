import fs from 'node:fs'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {
  const index = line.indexOf('=')
  return [line.slice(0, index), line.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, '$2')]
}))
const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, Prefer: 'count=exact' }
const fields = [['actual_import_staging', 'subregion'], ...['actuals', 'budgets', 'actual_import_staging', 'budget_import_staging'].flatMap(table => ['asm', 'rsm'].map(column => [table, column]))]
const results = []
for (const [table, column] of fields) {
  const counts = {}
  for (const [label, filter] of [['totalRows', ''], ['nonNullRows', '&' + column + '=not.is.null'], ['nonEmptyRows', '&' + column + '=not.is.null&' + column + '=neq.']]) {
    const response = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/' + table + '?select=' + column + filter, { method: 'HEAD', headers, signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error(table + '.' + column + ': HTTP ' + response.status)
    const range = response.headers.get('content-range')
    if (!range || !/\/\d+$/.test(range)) throw new Error('Exact count missing for ' + table + '.' + column)
    counts[label] = Number(range.split('/').at(-1))
  }
  results.push({ table, column, ...counts })
}
const report = { inspectedAt: new Date().toISOString(), method: 'Read-only HEAD requests with exact counts; whitespace-only strings count as nonempty.', columns: results }
fs.writeFileSync('outputs/database-audit/cleanup-column-counts.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
