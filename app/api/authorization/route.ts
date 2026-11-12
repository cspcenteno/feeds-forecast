import { NextResponse } from 'next/server'
import { createClient } from '@/lib/server'
import { supabaseAdmin } from '@/lib/admin'
import { savedPermissions } from '@/lib/authorization-rules'

export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' }
  try {
    const client = await createClient()
    const { data: { user }, error } = await client.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401, headers })

    // Always scope privileged reads to the verified session, never a supplied ID.
    // Permission-table RLS must not prevent an account from loading its own grants.
    const { data: profile, error: profileError } = await supabaseAdmin.from('users')
      .select('role, is_active, region_id, subregion_id').eq('id', user.id).maybeSingle()
    if (profileError) throw new Error('Unable to load account details.')
    if (!profile?.is_active) return NextResponse.json({ error: 'An active account is required.' }, { status: 403, headers })

    const { data: rows, error: permissionError } = await supabaseAdmin.from('user_permissions')
      .select('module, can_view, can_add, can_edit, can_delete').eq('user_id', user.id)
    if (permissionError) throw new Error('Unable to load permissions. Please try again.')
    return NextResponse.json({
      role: profile.role,
      regionId: profile.region_id == null ? null : Number(profile.region_id),
      subregionId: profile.subregion_id == null ? null : Number(profile.subregion_id),
      permissions: savedPermissions(rows ?? []),
    }, { headers })
  } catch {
    return NextResponse.json({ error: 'Unable to load your access permissions. Please try again.' }, { status: 500, headers })
  }
}
