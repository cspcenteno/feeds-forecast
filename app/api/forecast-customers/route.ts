import { NextResponse } from 'next/server'
import { createClient } from '@/lib/server'
import { assignedForecastCustomers, isKamCustomerScope } from '@/lib/forecast-customers'

export async function GET() {
  try {
    const client = await createClient()
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Sign in to view customers.' }, { status: 401 })
    const { data: profile, error } = await client.from('users')
      .select('role, position, full_name, is_active').eq('id', user.id).single()
    if (error) throw error
    if (!profile?.is_active) return NextResponse.json({ error: 'Your account is inactive.' }, { status: 403 })
    const customers: { id: number; customer: string; region_id: number | null; salesman: string | null }[] = []
    for (let from = 0; ; from += 500) {
      const { data, error } = await client.from('customers').select('id, customer, region_id, salesman')
        .eq('is_active', true).order('customer').order('id').range(from, from + 499)
      if (error) throw error
      customers.push(...assignedForecastCustomers(data ?? [], profile))
      if (!data || data.length < 500) break
    }
    return NextResponse.json({ customers: customers.map(({ id, customer, region_id }) => ({ id, customer, region_id })), restricted: isKamCustomerScope(profile) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load assigned customers.' }, { status: 500 })
  }
}
