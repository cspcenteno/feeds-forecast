import { NextResponse } from 'next/server'
import { createClient } from '@/lib/server'
import { supabaseAdmin } from '@/lib/admin'

export async function GET() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to load names.' }, { status: 401 })
  const { data: profile } = await client.from('users').select('is_active').eq('id', user.id).single()
  if (!profile?.is_active) return NextResponse.json({ error: 'Your account is inactive.' }, { status: 403 })
  const names = new Set<string>()
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseAdmin.from('users').select('full_name').in('position', ['KAM', 'RSM', 'ASM', 'NSM'])
      .eq('is_active', true)
      .order('id').range(offset, offset + 499)
    if (error) return NextResponse.json({ error: 'Unable to load salesman names.' }, { status: 500 })
    for (const row of data ?? []) if (row.full_name?.trim()) names.add(row.full_name.trim())
    if (!data || data.length < 500) break
  }
  return NextResponse.json({ names: [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true })) }, { headers: { 'Cache-Control': 'no-store' } })
}
