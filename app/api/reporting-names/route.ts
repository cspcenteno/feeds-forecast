import { NextResponse } from 'next/server'
import { createClient } from '@/lib/server'
import { supabaseAdmin } from '@/lib/admin'

export async function POST(request: Request) {
  try {
    const client = await createClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Sign in to load reporting names.' }, { status: 401 })
    const { data: profile } = await client.from('users').select('role,is_active').eq('id',user.id).single()
    if (!profile?.is_active) return NextResponse.json({ error:'An active account is required.' },{status:403})
    const { module, ids } = await request.json()
    if (!['Weekly Sales','Approvals'].includes(module) || !Array.isArray(ids) || ids.length > 10000 || ids.some((id) => !Number.isSafeInteger(id))) return NextResponse.json({ error:'Invalid reporting request.' },{status:400})
    const { data: allowed, error: permissionError } = await client.rpc('forecast_workflow_permission',{p_module:module,p_action:'view'})
    if (permissionError || !allowed) return NextResponse.json({error:'Reporting view permission is required.'},{status:403})
    const people = new Set<string>()
    for (let offset=0; offset<ids.length; offset+=250) {
      // Resolve identities only from records visible to this caller. Admin names
      // do not depend on the unrelated Users-module SELECT policy.
      const query = module === 'Weekly Sales' ? client.rpc('get_weekly_sales_reporting')
        : profile.role === 'Admin' ? client.from('forecasts') : client.rpc('get_forecast_review_queue')
      const { data, error } = await query.select('id,user_id,submitted_by,endorsed_by').in('id',ids.slice(offset,offset+250))
      if (error || !Array.isArray(data)) throw new Error('Unable to verify visible forecast records.')
      for (const row of data) for (const id of [row.user_id,row.submitted_by,row.endorsed_by]) if (id) people.add(id)
    }
    const names: Record<string,string> = {}
    const personIds = [...people]
    for (let offset=0; offset<personIds.length; offset+=250) {
      const {data,error} = await supabaseAdmin.from('users').select('id,full_name').in('id',personIds.slice(offset,offset+250))
      if (error) throw new Error('Unable to load reporting names.')
      for (const person of data ?? []) names[person.id] = person.full_name?.trim() || 'Name unavailable'
    }
    return NextResponse.json({names},{headers:{'Cache-Control':'no-store'}})
  } catch (error) {
    return NextResponse.json({error:error instanceof Error ? error.message : 'Unable to load reporting names.'},{status:500})
  }
}
