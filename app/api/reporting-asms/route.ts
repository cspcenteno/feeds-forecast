import { NextResponse } from 'next/server'
import { createClient } from '@/lib/server'
import { supabaseAdmin } from '@/lib/admin'

export async function GET(request: Request) {
  const reportModule = new URL(request.url).searchParams.get('module') || 'Weekly Sales'
  if (!['Weekly Sales', 'Approvals'].includes(reportModule)) return NextResponse.json({ error: 'Invalid reporting module.' }, { status: 400 })
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to view ASM groups.' }, { status: 401 })
  const { data: profile } = await client.from('users').select('role,position,is_active,region_id,subregion_id').eq('id',user.id).single()
  if (!profile?.is_active) return NextResponse.json({ error: 'An active account is required.' }, { status: 403 })
  let query = supabaseAdmin.from('users').select('id,full_name,region_id').eq('position','ASM').eq('is_active',true).order('id')
  if (reportModule === 'Approvals') {
    const { data: allowed, error: permissionError } = await client.rpc('forecast_workflow_permission', { p_module: 'Approvals', p_action: 'view' })
    if (permissionError || !allowed) return NextResponse.json({ error: 'Approvals view permission is required.' }, { status: 403 })
    if (!(profile.role === 'Admin' || profile.position === 'NSM')) {
      if (!profile.region_id || !((profile.role === 'Manager' && ['ASM', 'RSM'].includes(profile.position)) || (profile.role === 'Superuser' && profile.position === 'Supervisor'))) {
        return NextResponse.json({ error: 'An assigned approvals region is required.' }, { status: 403 })
      }
      query = query.eq('region_id', profile.region_id)
    }
  } else if (!(profile.role === 'Admin' || profile.position === 'NSM')) {
    const { data: allowed, error: permissionError } = await client.rpc('forecast_workflow_permission', { p_module: 'Weekly Sales', p_action: 'view' })
    if (permissionError || !allowed) return NextResponse.json({ error: 'Weekly Sales view permission is required.' }, { status: 403 })
    // Resolve assignments only for regions visible to this caller.
    const { data: regions, error: regionError } = await client.rpc('get_weekly_sales_reporting_regions').select('id')
    if (regionError || !Array.isArray(regions)) return NextResponse.json({ error: 'Unable to verify reporting regions.' }, { status: 500 })
    const ids = regions.map((region: { id: number }) => region.id)
    if (!ids.length) return NextResponse.json({ users: [] }, { headers: { 'Cache-Control': 'no-store' } })
    query = query.in('region_id', ids)
  }
  let rsmQuery = reportModule === 'Approvals' || (profile.role !== 'User' && profile.position !== 'KAM')
    ? supabaseAdmin.from('users').select('id,full_name,region_id,subregion_id').eq('position','RSM').eq('is_active',true).order('id') : null
  if (rsmQuery && !(profile.role === 'Admin' || profile.position === 'NSM')) {
    rsmQuery = rsmQuery.eq('region_id', profile.region_id)
    if (profile.position === 'RSM' || (reportModule === 'Approvals' && profile.position === 'Supervisor')) {
      if (!profile.subregion_id) return NextResponse.json({ error: 'An assigned subregion is required.' }, { status: 403 })
      rsmQuery = rsmQuery.eq('subregion_id', profile.subregion_id)
    }
  }
  let kamQuery = null
  if (reportModule === 'Weekly Sales' && profile.role === 'Manager' && profile.position === 'RSM') {
    if (!profile.region_id || !profile.subregion_id) return NextResponse.json({ error: 'An assigned region and subregion are required.' }, { status: 403 })
    kamQuery = supabaseAdmin.from('users').select('id,full_name,region_id,subregion_id').eq('position','KAM').eq('is_active',true)
      .eq('region_id',profile.region_id).eq('subregion_id',profile.subregion_id).order('full_name')
  }
  const [asms, rsms, kams] = await Promise.all([query, rsmQuery ?? Promise.resolve({ data: [], error: null }), kamQuery ?? Promise.resolve({ data: [], error: null })])
  if (asms.error || rsms.error || kams.error) return NextResponse.json({ error: 'Unable to load sales assignments.' }, { status: 500 })
  return NextResponse.json({ users: asms.data, rsms: rsms.data, kams: kams.data }, { headers: { 'Cache-Control':'no-store' } })
}
