export type MonthlyReference = {
  forecast_id: number
  team_level: 'asm' | 'rsm' | 'kam' | 'customer' | 'product'
  budget_volume: number
  actual_volume: number
  previous_actual_volume: number
  forecast_volume: number
}

export const monthlyReferenceKey = (id: number, level: MonthlyReference['team_level']) => JSON.stringify([id, level])

export async function loadMonthlyReferences(
  client: { rpc: (name: string, args: { p_ids: number[]; p_source: string }) => PromiseLike<{ data: unknown; error: { message: string } | null }> },
  ids: number[], source: 'saved' | 'weekly' | 'approvals' | 'dashboard',
) {
  const result = new Map<string, MonthlyReference>()
  // Each forecast can return five levels; keep every response below the row cap.
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await client.rpc('get_sales_monthly_reference', { p_ids: ids.slice(offset, offset + 100), p_source: source })
    if (error) throw new Error('Unable to load monthly references. ' + error.message)
    for (const row of (data ?? []) as MonthlyReference[]) result.set(monthlyReferenceKey(row.forecast_id, row.team_level), row)
  }
  return result
}
