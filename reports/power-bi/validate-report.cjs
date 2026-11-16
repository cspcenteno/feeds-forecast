const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const root = path.join(__dirname, 'Feed Sales Dashboard');
const cache = path.join(__dirname, 'schemas');
fs.mkdirSync(cache, { recursive: true });
const pending = new Map();
async function loadSchema(uri) {
  const url = uri.split('#')[0];
  if (pending.has(url)) return pending.get(url);
  const promise = (async () => {
    if (!url.startsWith('https://developer.microsoft.com/json-schemas/')) throw new Error('Unexpected schema host');
    const target = path.join(cache, url.slice(url.indexOf('/json-schemas/') + 14).replaceAll('/', '_'));
    let result;
    if (fs.existsSync(target)) result = JSON.parse(fs.readFileSync(target, 'utf8'));
    else {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Schema ${response.status}: ${url}`);
      result = await response.json();
      fs.writeFileSync(target, JSON.stringify(result));
    }
    return result;
  })();
  pending.set(url, promise);
  return promise;
}
function files(dir) {
  return fs.readdirSync(dir).flatMap(name => {
    const file = path.join(dir, name);
    return fs.statSync(file).isDirectory() ? files(file) : [file];
  });
}
(async () => {
  const ajv = new Ajv({ loadSchema, allErrors: true, schemaId: 'auto', unknownFormats: 'ignore' });
  let checked = 0;
  for (const file of files(root)) {
    if (!/\.(json|pbip|pbir|pbism)$/.test(file)) continue;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data.$schema) continue;
    const schema = await loadSchema(data.$schema);
    const validate = await ajv.compileAsync(schema);
    if (!validate(data)) throw new Error(`${path.relative(root,file)}: ${JSON.stringify(validate.errors)}`);
    checked++;
  }
  console.log(`Microsoft JSON schemas validated: ${checked} files`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
