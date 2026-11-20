import { NextResponse } from 'next/server'
import { createClient } from '@/lib/server'
import { supabaseAdmin } from '@/lib/admin'
import { savedPermissions } from '@/lib/authorization-rules'
import { canReadAllVolumeRegions, requiresVolumeSubregion } from '@/lib/volume-visibility'

export async function GET() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to import Actuals.' }, { status: 401 })
  const [profile, grants] = await Promise.all([
    supabaseAdmin.from('users').select('role,position,is_active,region_id,subregion_id').eq('id', user.id).single(),
    supabaseAdmin.from('user_permissions').select('module,can_view,can_add,can_edit,can_import,can_export,can_delete').eq('user_id', user.id),
  ])
  if (profile.error || grants.error) return NextResponse.json({ error: 'Unable to verify Actuals import access.' }, { status: 500 })
  const viewer = profile.data, permission = savedPermissions(grants.data ?? []).Actuals
  if (!viewer?.is_active || !permission.view || !permission.add || !permission.import) return NextResponse.json({ error: 'Actuals View, Add and Import permissions are required.' }, { status: 403 })
  const allRegions = canReadAllVolumeRegions(viewer.role, viewer.position ?? '')
  const scopedSubregion = requiresVolumeSubregion(viewer.role, viewer.position ?? '')
  if ((!allRegions && !viewer.region_id) || (scopedSubregion && !viewer.subregion_id)) return NextResponse.json({ error: 'Your account needs an assigned region/subregion.' }, { status: 403 })
  const users = []
  for (let from = 0; ; from += 500) {
    let query = supabaseAdmin.from('users').select('id,full_name,email,region_id,subregion_id,position').in('position',['KAM','RSM','ASM']).eq('is_active',true).order('id').range(from, from + 499)
    if (!allRegions) query = query.eq('region_id', viewer.region_id)
    if (scopedSubregion) query = query.or(`subregion_id.eq.${viewer.subregion_id},position.eq.ASM`)
    if (viewer.position === 'KAM') query = query.or(`id.eq.${user.id},position.in.(RSM,ASM)`)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: 'Unable to load salesperson assignments.' }, { status: 500 })
    users.push(...(data ?? []))
    if (!data || data.length < 500) break
  }
  return NextResponse.json({ users }, { headers: { 'Cache-Control': 'no-store' } })
}
