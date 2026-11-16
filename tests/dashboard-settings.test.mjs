import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { isDashboardType, dashboardTypeOrDefault } from '../lib/dashboard-settings.ts'
import { powerBiEmbedUrl } from '../lib/powerbi-report.ts'

test('only the three dashboard choices are accepted, with System as the fallback', () => {
  for (const value of ['system', 'powerbi', 'both']) assert.equal(isDashboardType(value), true)
  for (const value of [undefined, null, '', 'admin', '<iframe>', 1, {}]) {
    assert.equal(isDashboardType(value), false)
    assert.equal(dashboardTypeOrDefault(value), 'system')
  }
})

test('the embed configuration allows only HTTPS Power BI report URLs', () => {
  const saved = process.env.POWERBI_EMBED_URL
  try {
    for (const value of ['javascript:alert(1)', 'http://app.powerbi.com/view?r=x', 'https://example.com/view?r=x', 'https://app.powerbi.com.evil.example/view?r=x']) {
      process.env.POWERBI_EMBED_URL = value
      assert.equal(powerBiEmbedUrl(), null)
    }
    process.env.POWERBI_EMBED_URL = 'https://app.powerbi.com/reportEmbed?reportId=test'
    assert.equal(powerBiEmbedUrl(), process.env.POWERBI_EMBED_URL)
  } finally {
    if (saved === undefined) delete process.env.POWERBI_EMBED_URL
    else process.env.POWERBI_EMBED_URL = saved
  }
})

const compiled = ts.transpileModule(await readFile(new URL('../app/api/dashboard/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

test('Power BI-only users cannot fetch system dashboard data', async () => {
  let rpcCalls = 0
  for (const dashboardType of ['powerbi', 'system', 'both', undefined]) {
    const module = { exports: {} }
    vm.runInNewContext(compiled, { exports: module.exports, URL, require(name) {
      if (name === 'next/server') return { NextResponse: { json: (body, options) => ({body, status: options?.status ?? 200}) } }
      if (name === '@/lib/dashboard-settings') return { dashboardTypeOrDefault }
      if (name === '@/lib/server') return { createClient: async () => ({
        auth: { getUser: async () => ({data:{user:{id:'viewer'}}}) },
        rpc: async () => { rpcCalls++; return {data:null,error:null} },
      }) }
      if (name === '@/lib/admin') return { supabaseAdmin: { from() { return {select() { return this }, eq() { return this },
        maybeSingle: async () => ({data:{is_active:true,dashboard_type:dashboardType},error:null}),
      } } } }
      return {}
    } })
    const before = rpcCalls
    const result = await module.exports.GET({ url: 'https://example.com/api/dashboard?month=2026-11' })
    assert.equal(result.status, 403)
    assert.equal(rpcCalls - before, dashboardType === 'powerbi' ? 0 : 1)
  }
})

const pageSource = ts.transpileModule(await readFile(new URL('../app/(authenticated)/dashboard/page.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText

test('dashboard settings render System, Power BI, or a switch without mounting hidden views', () => {
  function render(dashboardType, view = true) {
    const module = { exports: {} }
    vm.runInNewContext(pageSource, { exports: module.exports, require(name) {
      if (name === 'react') return React
      if (name === 'react/jsx-runtime') return jsxRuntime
      if (name === 'next/dynamic') return {default: () => () => React.createElement('p', null, 'Existing system dashboard')}
      if (name === '@/lib/authorization') return {useAuthorization: () => ({dashboardType, powerBiEmbedUrl:'https://app.powerbi.com/view?r=test', can: () => view})}
      throw Error(name)
    } })
    return renderToStaticMarkup(React.createElement(module.exports.default))
  }
  assert.match(render('system'), /Existing system dashboard/)
  assert.doesNotMatch(render('system'), /iframe|Dashboard view/)
  assert.match(render('powerbi'), /iframe/)
  assert.doesNotMatch(render('powerbi'), /Existing system dashboard|Dashboard view/)
  assert.match(render('both'), /Dashboard view/)
  assert.match(render('both'), /Existing system dashboard/)
  assert.doesNotMatch(render('both'), /iframe/)
  assert.equal(render('both', false), '')
})
