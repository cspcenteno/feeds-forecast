import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { saveForecastDrafts } from '../lib/save-forecast-drafts.ts'

test('mixed new and edited forecasts request generated IDs for missing IDs', async () => {
  let request
  const client = createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, options) => {
      request = { url: String(url), headers: new Headers(options.headers), body: JSON.parse(options.body) }
      return new Response(null, { status: 201 })
    } },
  })
  const existing = { id: 123, year: 2026, week: 46, product_id: 312, forecast: 1, volume: 0.5 }
  const added = { year: 2026, week: 46, product_id: 313, forecast: 2, volume: 1 }
  const result = await saveForecastDrafts(client, [existing, added])
  assert.equal(result.error, null)
  assert.match(request.headers.get('prefer'), /missing=default/)
  assert.equal(new URL(request.url).searchParams.get('on_conflict'), 'id')
  assert.equal(request.body[0].id, 123)
  assert.equal(Object.hasOwn(request.body[1], 'id'), false)
  assert.equal(request.body[0].volume, 0.5)
})

test('another new entry for the same product/week does not reuse an existing ID', async () => {
  let body
  const client = createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (_url, options) => {
      body = JSON.parse(options.body)
      return new Response(null, { status: 201 })
    } },
  })
  await saveForecastDrafts(client, [{ year: 2026, week: 46, product_id: 312, forecast: 1, volume: 0.5 }])
  assert.equal(Object.hasOwn(body[0], 'id'), false)
})
