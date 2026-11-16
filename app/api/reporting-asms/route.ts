import { NextResponse } from 'next/server'
import { createClient } from '@/lib/server'
import { supabaseAdmin } from '@/lib/admin'

export async function GET() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to view ASM groups.' }, { status: 401 })
  const { data: profile } = await client.from('users').select('role,position,is_active').eq('id',user.id).single()
  if (!profile?.is_active) return NextResponse.json({ error: 'An active account is required.' }, { status: 403 })
  let query = supabaseAdmin.from('users').select('id,full_name,region_id').eq('position','ASM').eq('is_active',true).order('id')
  if (!(profile.role === 'Admin' || profile.position === 'NSM')) {
    const { data: allowed, error: permissionError } = await client.rpc('forecast_workflow_permission', { p_module: 'Weekly Sales', p_action: 'view' })
    if (permissionError || !allowed) return NextResponse.json({ error: 'Weekly Sales view permission is required.' }, { status: 403 })
    // Resolve assignments only for regions visible to this caller.
    const { data: regions, error: regionError } = await client.rpc('get_weekly_sales_reporting_regions').select('id')
    if (regionError || !Array.isArray(regions)) return NextResponse.json({ error: 'Unable to verify reporting regions.' }, { status: 500 })
    const ids = regions.map((region: { id: number }) => region.id)
    if (!ids.length) return NextResponse.json({ users: [] }, { headers: { 'Cache-Control': 'no-store' } })
    query = query.in('region_id', ids)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Unable to load ASM assignments.' }, { status: 500 })
  return NextResponse.json({ users: data }, { headers: { 'Cache-Control':'no-store' } })
}
