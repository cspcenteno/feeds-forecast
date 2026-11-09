import { NextResponse } from 'next/server'
import { createClient } from '@/lib/server'
import { supabaseAdmin } from '@/lib/admin'

export async function GET() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to view ASM groups.' }, { status: 401 })
  const { data: profile } = await client.from('users').select('role,position,is_active').eq('id',user.id).single()
  if (!profile?.is_active || !(profile.role === 'Admin' || profile.position === 'NSM')) return NextResponse.json({ error: 'Admin or NSM access is required.' }, { status: 403 })
  const { data, error } = await supabaseAdmin.from('users').select('id,full_name,region_id').eq('position','ASM').eq('is_active',true).order('id')
  if (error) return NextResponse.json({ error: 'Unable to load ASM assignments.' }, { status: 500 })
  return NextResponse.json({ users: data }, { headers: { 'Cache-Control':'no-store' } })
}
