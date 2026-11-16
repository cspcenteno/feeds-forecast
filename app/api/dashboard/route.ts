import { NextResponse } from 'next/server'
import { createClient } from '@/lib/server'
import { supabaseAdmin } from '@/lib/admin'
import { actualInDashboardScope, mergeRegionalActuals } from '@/lib/dashboard-comparisons'
import { buildDashboardPerformance, dashboardLevel } from '@/lib/dashboard-performance'
import { buildKamVolumeScope } from '@/lib/kam-volume-scope'
import { asmForRegion, type AsmUser } from '@/lib/asm-reporting'

type Detail = { region_id: number | null; subregion_id: number | null; customer_id: number | null; product_id: number | null; volume: number }
type Dashboard = {
  scope: 'global' | 'asm' | 'rsm' | 'kam'
  regions: { region: string; budget: number; forecast: number }[]
  details: Detail[]
}

export async function GET(request: Request) {
  try {
    const month = new URL(request.url).searchParams.get('month') ?? ''
    if (!/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: 'Select a valid month.' }, { status: 400 })
    const client = await createClient()
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Sign in to view the dashboard.' }, { status: 401 })
    // The existing RPC verifies Dashboard permission and computes the viewer's
    // scope. Keep those permissions for the independent Actual aggregation too.
    const { data: dashboardData, error: dashboardError } = await client.rpc('get_monthly_sales_dashboard', { p_month: month + '-01' })
    if (dashboardError) throw new Error(dashboardError.message)
    if (!dashboardData) return NextResponse.json({ error: 'Dashboard data is unavailable for this account.' }, { status: 403 })
    const dashboard = dashboardData as Dashboard
    const { data: profile, error: profileError } = await supabaseAdmin.from('users')
      .select('role, position, is_active, region_id, subregion_id').eq('id', user.id).maybeSingle()
    if (profileError) throw new Error(profileError.message)
    if (!profile?.is_active) return NextResponse.json({ error: 'Your account is inactive.' }, { status: 403 })
    const level = dashboardLevel(profile)
    const isSupervisor = profile.role === 'Superuser' && ['SV', 'SUPERVISOR'].includes(String(profile.position ?? '').trim().toUpperCase())
    if (isSupervisor) dashboard.details = dashboard.details.filter((row) => profile.region_id != null && row.region_id === profile.region_id)
    else if (dashboard.scope === 'rsm') dashboard.details = dashboard.details.filter((row) => profile.region_id != null && profile.subregion_id != null && row.region_id === profile.region_id && row.subregion_id === profile.subregion_id)
    const kamKeys = new Set(dashboard.details.map((row) => JSON.stringify([row.region_id, row.customer_id, row.product_id])))
    let ownsImportedVolume: ReturnType<typeof buildKamVolumeScope> = () => false
    if (dashboard.scope === 'kam' && profile.region_id !== null) {
      const kams: { id: string; full_name: string | null; email: string | null }[] = []
      const customers: { id: number; salesman: string | null }[] = []
      let userCursor: string | null = null
      while (true) {
        const query = supabaseAdmin.from('users').select('id, full_name, email')
          .eq('region_id', profile.region_id).eq('is_active', true).eq('position', 'KAM').order('id').limit(500)
        if (userCursor !== null) query.gt('id', userCursor)
        const { data, error } = await query.abortSignal(AbortSignal.timeout(45000))
        if (error) throw new Error('Unable to resolve KAM assignments: ' + error.message)
        kams.push(...(data ?? []))
        if (!data || data.length < 500) break
        userCursor = data[data.length - 1].id
      }
      let customerCursor: number | null = null
      while (true) {
        const query = supabaseAdmin.from('customers').select('id, salesman')
          .eq('region_id', profile.region_id).order('id').limit(500)
        if (customerCursor !== null) query.gt('id', customerCursor)
        const { data, error } = await query.abortSignal(AbortSignal.timeout(45000))
        if (error) throw new Error('Unable to resolve customer assignments: ' + error.message)
        customers.push(...(data ?? []))
        if (!data || data.length < 500) break
        customerCursor = data[data.length - 1].id
      }
      ownsImportedVolume = buildKamVolumeScope(user.id, profile.region_id, kams, customers, kamKeys)
    }
    const totals = new Map<number | null, number>()
    const actualRows: Parameters<typeof buildDashboardPerformance>[3] = []
    const first = month + '-01'
    const [year, monthNumber] = month.split('-').map(Number)
    const next = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10)
    if (dashboard.scope !== 'kam' || profile.region_id !== null) {
      let lastId: number | null = null
      while (true) {
        const query = supabaseAdmin.from('actuals').select('id, region_id, subregion_id, customer_id, product_id, kam, volume')
          .gte('actual_date', first).lt('actual_date', next).order('id').limit(500)
        if (dashboard.scope !== 'global') {
          if (profile.region_id == null) break
          query.eq('region_id', profile.region_id)
        }
        if (!isSupervisor && dashboard.scope === 'rsm') {
          if (profile.region_id == null) break
          query.eq('region_id', profile.region_id)
          if (profile.subregion_id == null) break
          query.eq('subregion_id', profile.subregion_id)
        }
        if (lastId !== null) query.gt('id', lastId)
        const { data, error } = await query.abortSignal(AbortSignal.timeout(45000))
        if (error) throw new Error(`Unable to load monthly Actuals: ${error.message}`)
        for (const row of data ?? []) {
          if (!(dashboard.scope === 'kam' ? ownsImportedVolume(row) : actualInDashboardScope(row, { scope: dashboard.scope, regionId: profile.region_id, subregionId: profile.subregion_id, isSupervisor }, kamKeys))) continue
          actualRows.push(row)
          totals.set(row.region_id, (totals.get(row.region_id) ?? 0) + Number(row.volume ?? 0))
        }
        if (!data || data.length < 500) break
        lastId = data[data.length - 1].id
      }
    }
    const regionIds = [...new Set([...totals.keys(), ...dashboard.details.map((row) => row.region_id), ...(dashboard.scope === 'kam' ? [profile.region_id] : [])])].filter((id): id is number => id !== null)
    const names = new Map<number, string>()
    if (regionIds.length) {
      const { data, error } = await supabaseAdmin.from('regions').select('id, name').in('id', regionIds)
      if (error) throw new Error(error.message)
      for (const region of data ?? []) names.set(region.id, region.name)
    }
    const actuals = [...totals].map(([id, actual]) => ({ region: id === null ? 'Unassigned' : names.get(id) ?? 'Unassigned', actual }))
    let regions = mergeRegionalActuals(dashboard.regions, actuals)
    let performanceRows: ReturnType<typeof buildDashboardPerformance>
    if (level === 'region' || level === 'company') {
      performanceRows = regions.map((row) => ({ ...row, key: row.region }))
    } else {
      const budgets: Parameters<typeof buildDashboardPerformance>[2] = []
      let cursor: number | null = null
      while (dashboard.scope !== 'kam' || profile.region_id !== null) {
        const query = supabaseAdmin.from('budgets').select('id, region_id, subregion_id, customer_id, product_id, kam, month, volume')
          .eq('year', year).or('month.eq.' + monthNumber + ',month.is.null').order('id').limit(500)
        if (dashboard.scope !== 'global') {
          if (profile.region_id == null) break
          query.eq('region_id', profile.region_id)
        }
        if (!isSupervisor && dashboard.scope === 'rsm') {
          if (profile.region_id == null) break
          query.eq('region_id', profile.region_id)
          if (profile.subregion_id == null) break
          query.eq('subregion_id', profile.subregion_id)
        }
        if (cursor !== null) query.gt('id', cursor)
        const { data, error } = await query.abortSignal(AbortSignal.timeout(45000))
        if (error) throw new Error(`Unable to load performance budgets: ${error.message}`)
        for (const row of data ?? []) {
          if (dashboard.scope === 'kam' ? ownsImportedVolume(row) : actualInDashboardScope(row, { scope: dashboard.scope, regionId: profile.region_id, subregionId: profile.subregion_id, isSupervisor }, kamKeys)) budgets.push(row)
        }
        if (!data || data.length < 500) break
        cursor = data[data.length - 1].id
      }
      const allRows = [...dashboard.details, ...budgets, ...actualRows]
      async function labels(table: string, idField: 'subregion_id' | 'customer_id' | 'product_id', columns: string) {
        const ids = [...new Set(allRows.map((row) => row[idField]).filter((id): id is number => id !== null))]
        const result = new Map<number, string>()
        for (let start = 0; start < ids.length; start += 500) {
          const { data, error } = await supabaseAdmin.from(table).select(columns).in('id', ids.slice(start, start + 500))
          if (error) throw new Error(error.message)
          for (const raw of (data ?? []) as unknown as { id: number; name?: string; customer?: string; code?: string }[]) {
            result.set(raw.id, table === 'products' ? [raw.code, raw.name].filter(Boolean).join(' - ') : raw.customer ?? raw.name ?? 'Unassigned')
          }
        }
        return result
      }
      const [subregions, customers, products] = await Promise.all([
        labels('subregions', 'subregion_id', 'id, name'), labels('customers', 'customer_id', 'id, customer'), labels('products', 'product_id', 'id, code, name'),
      ])
      const labelMaps = { regions: names, subregions, customers, products }
      performanceRows = buildDashboardPerformance(level, dashboard.details, budgets, actualRows, labelMaps)
      // Keep the legacy regional field scoped consistently as well.
      regions = buildDashboardPerformance('region', dashboard.details, budgets, actualRows, labelMaps)
    }
    const areaLevel = profile.role !== 'Admin' && String(profile.position ?? '').trim().toUpperCase() === 'KAM' ? 'subregion' : 'region'
    const showAsm = profile.role === 'Admin' || profile.position === 'NSM'
    let asmUsers: AsmUser[] = []
    if (showAsm) {
      const { data, error } = await supabaseAdmin.from('users').select('id,full_name,region_id').eq('position','ASM').eq('is_active',true).order('id')
      if (error) throw new Error('Unable to load ASM assignments.')
      asmUsers = data ?? []
    }
    const details = dashboard.details.map((row) => ({ ...row, ...(showAsm ? asmForRegion(row.region_id,asmUsers) : {}), region: row.region_id === null ? null : names.get(row.region_id) ?? null }))
    let assignedSubregion: string | null = null
    if (dashboard.scope === 'kam' && profile.subregion_id !== null) {
      const { data, error } = await supabaseAdmin.from('subregions').select('name').eq('id',profile.subregion_id).maybeSingle()
      if (error) throw new Error('Unable to load assigned subregion.')
      assignedSubregion = data?.name ?? null
    }
    return NextResponse.json({ ...dashboard, showAsm, details, assignedSubregion, areaLevel, regions, actualRecordCount: actualRows.length, performance: { level, rows: performanceRows } }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load dashboard data.' }, { status: 500 })
  }
}
