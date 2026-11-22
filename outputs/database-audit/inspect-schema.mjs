import fs from 'node:fs'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {
  const index = line.indexOf('=')
  return [line.slice(0, index), line.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, '$2')]
}))
const response = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/', {
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, Accept: 'application/openapi+json' },
  signal: AbortSignal.timeout(30000),
})
if (!response.ok) throw new Error('Schema inspection returned HTTP ' + response.status)
const schema = await response.json()
const inventory = Object.entries(schema.definitions ?? {}).map(([table, definition]) => ({ table, required: definition.required ?? [], columns: Object.entries(definition.properties ?? {}).map(([column, metadata]) => ({ column, ...metadata })) }))
fs.writeFileSync('outputs/database-audit/live-schema.json', JSON.stringify(inventory, null, 2))
console.log(JSON.stringify(inventory.map(({ table, columns }) => ({ table, columns: columns.map(column => column.column) })), null, 2))
