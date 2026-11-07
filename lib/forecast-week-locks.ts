import type { createClient } from '@/lib/client'

export type ForecastWeekState = { year: number; week: number; status: 'Open' | 'Locked' }

export async function loadForecastWeekStates(
  client: Pick<ReturnType<typeof createClient>, 'rpc'>,
  periods: { year: number; week: number }[],
): Promise<ForecastWeekState[]> {
  const unique = [...new Map(periods.map((period) => [`${period.year}|${period.week}`, period])).values()]
  const states: ForecastWeekState[] = []
  for (let start = 0; start < unique.length; start += 250) {
    const batch = unique.slice(start, start + 250)
    const { data, error } = await client.rpc('get_forecast_week_states', { p_periods: batch })
    if (error) throw new Error('Unable to verify forecast week locks. ' + error.message)
    const returned = data as ForecastWeekState[] | null
    if (!Array.isArray(returned) || returned.length !== batch.length ||
      batch.some((period) => !returned.some((row) => row.year === period.year && row.week === period.week && ['Open', 'Locked'].includes(row.status)))) {
      throw new Error('Unable to verify all forecast week locks. Refresh and retry.')
    }
    states.push(...returned)
  }
  return states
}
