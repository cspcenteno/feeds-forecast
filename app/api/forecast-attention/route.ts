import { NextResponse } from 'next/server'
import { createClient } from '@/lib/server'
import { supabaseAdmin } from '@/lib/admin'
import { defaultPermissions } from '@/lib/authorization-rules'

export async function GET() {
  try {
    const client = await createClient()
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError && authError.name !== 'AuthSessionMissingError') throw new Error('Unable to verify the session.')
    if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
    const { data: profile, error } = await client.from('users').select('role, position, region_id, subregion_id, is_active').eq('id', user.id).single()
    if (error) throw new Error('Unable to load account details.')
    if (!profile?.is_active) return NextResponse.json({ error: 'An active account is required.' }, { status: 403 })
    const { data: savedPermissions, error: permissionError } = await client.from('user_permissions')
      .select('module, can_view').eq('user_id', user.id)
    if (permissionError) throw new Error('Unable to load permissions.')
    const defaults = defaultPermissions(profile.role)
    const permission = (module: 'Forecast Input' | 'Approvals') => {
      const saved = savedPermissions?.find((row) => row.module === module)
      return saved ? saved.can_view === true : defaults[module].view
    }
    const returned: { id: number; remarks: string | null; returned_by: string | null; returned_at: string | null }[] = []
    if (await permission('Forecast Input')) {
      let cursor: number | null = null
      while (true) {
        const query = client.from('sales_forecasts').select('id, remarks, returned_by, returned_at')
          .eq('user_id', user.id).or('status.eq.Rejected,and(status.eq.Draft,returned_at.not.is.null)').order('id').limit(500)
        if (cursor !== null) query.gt('id', cursor)
        const { data, error } = await query.abortSignal(AbortSignal.timeout(20000))
        if (error) throw new Error(error.message)
        returned.push(...(data ?? []))
        if (!data || data.length < 500) break
        cursor = data[data.length - 1].id
      }
    }
    const reviewers = new Map<string, string>()
    const reviewerIds = [...new Set(returned.flatMap((row) => row.returned_by ? [row.returned_by] : []))]
    for (let start = 0; start < reviewerIds.length; start += 500) {
      // Only resolve reviewers of this authenticated user's own returned records.
      const { data, error } = await supabaseAdmin.from('users').select('id, full_name').in('id', reviewerIds.slice(start, start + 500))
      if (error) throw new Error(error.message)
      for (const row of data ?? []) reviewers.set(row.id, row.full_name || 'Reviewer')
    }
    let pending = 0
    let endorsed = 0
    if (await permission('Approvals')) {
      const admin = profile.role === 'Admin'
      const rsm = profile.role === 'Manager' && profile.position === 'RSM'
      const asm = profile.role === 'Manager' && profile.position === 'ASM'
      const count = async (status: string) => {
        let query = client.from('sales_forecasts').select('id', { count: 'exact', head: true }).eq('status', status)
        if (!admin) {
          if (profile.region_id === null || (rsm && profile.subregion_id === null)) return 0
          query = query.eq('region_id', profile.region_id)
          if (rsm) query = query.eq('subregion_id', profile.subregion_id)
        }
        const { count, error } = await query
        if (error) throw new Error(error.message)
        return count ?? 0
      }
      if (admin || rsm) pending = await count('Pending')
      if (admin || asm) endorsed = await count('Endorsed')
    }
    return NextResponse.json({ returned: returned.map((row) => ({ ...row, reviewer: reviewers.get(row.returned_by ?? '') ?? 'Reviewer' })), pending, endorsed }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Unable to load forecast notifications.' }, { status: 500 })
  }
}
