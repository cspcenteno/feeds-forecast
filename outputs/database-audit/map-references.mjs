import fs from 'node:fs'
import path from 'node:path'
function files(root, extensions) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const name = path.join(root, entry.name)
    return entry.isDirectory() ? files(name, extensions) : extensions.includes(path.extname(name)) ? [name] : []
  })
}
const sources = [...files('app', ['.ts', '.tsx']), ...files('components', ['.ts', '.tsx']), ...files('lib', ['.ts', '.tsx'])].map(file => ({ file, text: fs.readFileSync(file, 'utf8') }))
const sql = files('supabase', ['.sql']).map(file => ({ file, text: fs.readFileSync(file, 'utf8') }))
const schema = JSON.parse(fs.readFileSync('outputs/database-audit/live-schema.json', 'utf8'))
const inventory = schema.map(table => ({ table: table.table, columns: table.columns.map(({ column, type, format }) => {
  const pattern = new RegExp('\\b' + column + '\\b')
  return { column, type, format, appFiles: sources.filter(source => pattern.test(source.text)).map(source => source.file), sqlFiles: sql.filter(source => pattern.test(source.text)).map(source => source.file) }
}) }))
fs.writeFileSync('outputs/database-audit/identifier-references.json', JSON.stringify(inventory, null, 2))
console.log(JSON.stringify({ tables: inventory.length, columns: inventory.reduce((sum, table) => sum + table.columns.length, 0), noAppIdentifierMatches: inventory.flatMap(table => table.columns.filter(column => !column.appFiles.length).map(column => table.table + '.' + column.column)) }, null, 2))
