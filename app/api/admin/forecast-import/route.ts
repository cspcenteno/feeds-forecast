import { NextResponse } from 'next/server'
import { createClient } from '@/lib/server'
import { supabaseAdmin } from '@/lib/admin'
import { fromForecastStagingRow } from '@/lib/forecast-staging'
import { forecastImportPeriods, validateForecastImport, type ForecastImportReferences } from '@/lib/forecast-import'
import { loadForecastWeekStates } from '@/lib/forecast-week-locks'

async function authorize(action: 'view' | 'add') {
  const client = await createClient()
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Sign in to import forecasts.' }, { status: 401 })
  const { data: profile, error: profileError } = await supabaseAdmin.from('users')
    .select('role, is_active').eq('id', user.id).maybeSingle()
  if (profileError) throw new Error(profileError.message)
  if (!profile?.is_active || profile.role !== 'Admin') return NextResponse.json({ error: 'Only active Admins can import forecasts.' }, { status: 403 })
  const { data: permissions, error: permissionError } = await supabaseAdmin.from('user_permissions')
    .select('module, can_view, can_add').eq('user_id', user.id)
  if (permissionError) throw new Error(permissionError.message)
  const permission = permissions?.find((row) => row.module === 'Forecasts')
  if (permission?.can_view !== true || (action === 'add' && permission.can_add !== true)) {
    return NextResponse.json({ error: 'Forecast permission denied.' }, { status: 403 })
  }
  return null
}

async function load(table: string, columns: string, active = false) {
  const rows: Record<string, unknown>[] = []
  let cursor: string | number | null = null
  while (true) {
    const query = supabaseAdmin.from(table).select(columns).order('id').limit(500)
    if (active) query.eq('is_active', true)
    if (cursor !== null) query.gt('id', cursor)
    const { data, error } = await query.abortSignal(AbortSignal.timeout(45000))
    if (error) throw new Error(`Unable to load ${table}: ${error.message}`)
    const page = (data ?? []) as unknown as Record<string, unknown>[]
    rows.push(...page)
    if (page.length < 500) return rows
    cursor = page[page.length - 1].id as string | number
  }
}

async function loadUsers() {
  return load('users', 'id, full_name, is_active, region_id, subregion_id', true)
}

export async function GET() {
  try {
    const denied = await authorize('view')
    if (denied) return denied
    return NextResponse.json({ users: await loadUsers() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load KAM users.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const denied = await authorize('add')
    if (denied) return denied
    const body = await request.json().catch(() => null)
    if (!Array.isArray(body?.ids) || !body.ids.length || body.ids.length > 250 ||
      !body.ids.every((id: unknown) => typeof id === 'string' && /^\d+$/.test(id)) || new Set(body.ids).size !== body.ids.length) {
      return NextResponse.json({ error: 'Provide between 1 and 250 unique staging row IDs.' }, { status: 400 })
    }
    // Accept only staging IDs; resolve ownership and validate the database values
    // here so the browser cannot forge an owner, quantity, status, or locked week.
    const { data: staged, error: stagingError } = await supabaseAdmin.from('forecast_import_staging')
      .select('*').in('id', body.ids).order('id')
    if (stagingError) throw new Error(stagingError.message)
    if (staged?.length !== body.ids.length) return NextResponse.json({ error: 'Some uploaded rows are no longer available. Refresh staging.' }, { status: 409 })
    const stagedRows = staged.map(fromForecastStagingRow)
    const authenticatedClient = await createClient()
    const [users, regions, subregions, customers, products, forecasts, locks] = await Promise.all([
      loadUsers(), load('regions', 'id, name, code', true), load('subregions', 'id, name, region_id', true),
      load('customers', 'id, customer, region_id', true), load('products', 'id, code, name, category_id, weight', true),
      load('forecasts', 'id, user_id, year, week, region_id, subregion_id, customer_id, product_id'),
      loadForecastWeekStates(authenticatedClient, forecastImportPeriods(stagedRows)),
    ])
    const refs = { users, regions, subregions, customers, products, forecasts, locks } as unknown as ForecastImportReferences
    const preview = validateForecastImport(stagedRows, refs, { allRegions: true, regionId: null, subregionId: null })
    const invalid = preview.find((row) => row.status === 'Invalid')
    if (invalid) return NextResponse.json({ error: `Staging row ${invalid.source.id}: ${invalid.issues.join(' ')}` }, { status: 409 })
    const ready = preview.filter((row) => row.status === 'Ready')
    if (ready.length) {
      const { error: saveError } = await supabaseAdmin.from('forecasts')
        .insert(ready.map((row) => ({ ...row.payload, status: 'Draft' })))
      if (saveError) throw new Error(saveError.message)
      const ids = ready.map((row) => row.source.id)
      const { data: removed, error: cleanupError } = await supabaseAdmin.from('forecast_import_staging')
        .delete().in('id', ids).select('id')
      if (cleanupError || removed?.length !== ids.length) {
        throw new Error(`${ready.length} forecasts were saved, but staging cleanup did not complete. ${cleanupError?.message ?? 'Some staging rows were unavailable.'} Refresh validation before retrying; saved forecasts remain intact.`)
      }
    }
    return NextResponse.json({ imported: ready.length, skipped: preview.length - ready.length })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to import forecasts.' }, { status: 500 })
  }
}
