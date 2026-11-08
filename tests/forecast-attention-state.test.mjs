import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.transpileModule(await readFile(new URL('../lib/use-forecast-attention.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

test('shared notifications survive navigation and transient failures for all roles', async () => {
  for (const role of ['Admin','RSM','ASM','Supervisor','KAM']) {
    let state = null, pathname = '/dashboard', dependencies, cleanup
    const handlers = new Map()
    const attention = { returned: [{ id: 1 }], pending: role === 'RSM' || role === 'Admin' ? 2 : 0, endorsed: role === 'ASM' || role === 'Admin' ? 1 : 0 }
    let response = { status: 200, ok: true, json: async () => attention }
    const routeModule = { exports: {} }
    const react = {
      createContext: () => ({ Provider: {}, current: null }),
      createElement: (_type, props) => props.value,
      useContext: () => state,
      useState: () => [state, (value) => { state = value }],
      useEffect: (effect, next) => {
        if (dependencies?.[0] === next[0]) return
        cleanup?.()
        dependencies = next
        cleanup = effect()
      },
    }
    vm.runInNewContext(source, {
      exports: routeModule.exports,
      require: (name) => name === 'react' ? react : { usePathname: () => pathname },
      AbortController,
      fetch: async () => response,
      window: {
        setInterval: () => 1, clearInterval: () => {},
        addEventListener: (name, handler) => handlers.set(name,handler),
        removeEventListener: (name) => handlers.delete(name),
      },
    })
    const render = () => routeModule.exports.ForecastAttentionProvider({ children: null })
    render()
    await new Promise(setImmediate)
    assert.equal(render(), attention)

    // A destination page shares the existing snapshot while refreshing.
    response = { status: 500, ok: false }
    pathname = '/approvals'
    assert.equal(render(), attention)
    await new Promise(setImmediate)
    assert.equal(render(), attention)
    await handlers.get('focus')()
    assert.equal(render(), attention)

    // Only a successful workflow refresh can change the count to zero.
    const completed = { returned: [], pending: 0, endorsed: 0 }
    response = { status: 200, ok: true, json: async () => completed }
    await handlers.get('forecast-workflow-changed')()
    assert.equal(render(), completed)
    response = { status: 401, ok: false }
    await handlers.get('focus')()
    assert.equal(render(), null)
    cleanup()
  }
})
