import { NextResponse } from 'next/server'
import { createClient } from '@/lib/server'
import { supabaseAdmin } from '@/lib/admin'
import { savedPermissions } from '@/lib/authorization-rules'

export async function GET() {
  try {
    const client = await createClient()
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError && authError.name !== 'AuthSessionMissingError') throw new Error('Unable to verify the session.')
    if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
    const { data: profile, error } = await supabaseAdmin.from('users').select('role, position, region_id, subregion_id, is_active').eq('id', user.id).single()
    if (error) throw new Error('Unable to load account details.')
    if (!profile?.is_active) return NextResponse.json({ error: 'An active account is required.' }, { status: 403 })
    const { data: permissionRows, error: permissionError } = await supabaseAdmin.from('user_permissions')
      .select('module, can_view, can_add, can_edit, can_delete').eq('user_id', user.id)
    if (permissionError) throw new Error('Unable to load permissions.')
    const permissions = savedPermissions(permissionRows ?? [])
    const permission = (module: 'Forecasts' | 'Approvals') => {
      return permissions[module].view
    }
    const position = String(profile.position ?? '').trim().toUpperCase()
    const admin = profile.role === 'Admin'
    const rsm = profile.role === 'Manager' && position === 'RSM'
    const canReadReturned = rsm
      ? (permission('Approvals') || permission('Forecasts')) && profile.region_id != null && profile.subregion_id != null
      : permission('Forecasts')
    const returned: { id: number; remarks: string | null; returned_by: string | null; returned_at: string | null; customer_id: number | null }[] = []
    if (canReadReturned) {
      let cursor: number | null = null
      while (true) {
        const query = supabaseAdmin.from('forecasts').select('id, customer_id, remarks, returned_by, returned_at')
          .or('status.eq.Rejected,and(status.eq.Draft,returned_at.not.is.null)').order('id').limit(500)
        if (rsm) {
          query.eq('region_id', profile.region_id).eq('subregion_id', profile.subregion_id)
        } else if (!admin) {
          query.eq('user_id', user.id)
        }
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
      // Resolve reviewers only for records inside the authenticated account's scope.
      const { data, error } = await supabaseAdmin.from('users').select('id, full_name').in('id', reviewerIds.slice(start, start + 500))
      if (error) throw new Error(error.message)
      for (const row of data ?? []) reviewers.set(row.id, row.full_name || 'Reviewer')
    }
    let pending = 0
    let endorsed = 0
    if (await permission('Approvals')) {
      const asm = profile.role === 'Manager' && position === 'ASM'
      const count = async (status: string) => {
        if (!admin && (profile.region_id == null || (rsm && profile.subregion_id == null))) return 0
        const groups = new Set<string>()
        let cursor: number | null = null
        while (true) {
          const query = supabaseAdmin.from('forecasts')
            .select('id, submitted_by, user_id, endorsed_by').eq('status', status).order('id').limit(500)
          if (!admin) {
            query.eq('region_id', profile.region_id)
            if (rsm) query.eq('subregion_id', profile.subregion_id)
          }
          if (cursor !== null) query.gt('id', cursor)
          const { data, error } = await query.abortSignal(AbortSignal.timeout(20000))
          if (error) throw new Error(error.message)
          for (const row of data ?? []) {
            const person = status === 'Pending' ? row.submitted_by ?? row.user_id : row.endorsed_by
            groups.add(person ?? 'unassigned')
          }
          if (!data || data.length < 500) break
          cursor = data[data.length - 1].id
        }
        return groups.size
      }
      if (admin || rsm) pending = await count('Pending')
      if (admin || asm) endorsed = await count('Endorsed')
    }
    return NextResponse.json({ returned: returned.map((row) => ({ ...row, reviewer: reviewers.get(row.returned_by ?? '') ?? 'Reviewer' })), returnedCustomers: new Set(returned.map((row) => row.customer_id ?? null)).size, pending, endorsed }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Unable to load forecast notifications.' }, { status: 500 })
  }
}
