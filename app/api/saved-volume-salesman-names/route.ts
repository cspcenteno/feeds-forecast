import { NextResponse } from 'next/server'
import { createClient } from '@/lib/server'
import { supabaseAdmin } from '@/lib/admin'
import { savedPermissions } from '@/lib/authorization-rules'

export async function GET(request: Request) {
  const moduleName = new URL(request.url).searchParams.get('module')
  if (moduleName !== 'Budgets' && moduleName !== 'Actuals') return NextResponse.json({ error: 'Invalid module.' }, { status: 400 })
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to check salesman names.' }, { status: 401 })
  const [profile, grants] = await Promise.all([
    supabaseAdmin.from('users').select('is_active').eq('id', user.id).single(),
    supabaseAdmin.from('user_permissions').select('module,can_view,can_add,can_edit,can_delete,can_import,can_export').eq('user_id', user.id),
  ])
  if (profile.error || grants.error) return NextResponse.json({ error: 'Unable to verify saved records access.' }, { status: 500 })
  if (!profile.data?.is_active || !savedPermissions(grants.data ?? [])[moduleName].view) return NextResponse.json({ error: 'Saved records View permission is required.' }, { status: 403 })
  const names = new Set<string>()
  for (let offset = 0; ; offset += 500) {
    // Match any existing user's full name, including historical/inactive users.
    const { data, error } = await supabaseAdmin.from('users').select('full_name').order('id').range(offset, offset + 499)
    if (error) return NextResponse.json({ error: 'Unable to check salesman names. Refresh to retry.' }, { status: 500 })
    for (const row of data ?? []) if (row.full_name?.trim()) names.add(row.full_name.trim().toLowerCase().replace(/\s+/g, ' '))
    if (!data || data.length < 500) break
  }
  return NextResponse.json({ names: [...names] }, { headers: { 'Cache-Control': 'no-store' } })
}
