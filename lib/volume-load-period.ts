export function currentVolumePeriod(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Singapore', year: 'numeric', month: 'numeric' }).formatToParts(now)
  return { year: parts.find(part => part.type === 'year')!.value, month: String(Number(parts.find(part => part.type === 'month')!.value)) }
}

type VolumeLoadPhase = { year?: number; month?: number; from?: string; to?: string; or?: string }
export function volumeLoadPhases(actual: boolean, yearValue: string, monthValue: string): VolumeLoadPhase[] {
  const year = Number(yearValue), month = Number(monthValue)
  const hasYear = Boolean(yearValue) && Number.isInteger(year) && year >= 2020 && year <= 2100
  const hasMonth = Boolean(monthValue) && Number.isInteger(month) && month >= 1 && month <= 12
  if (actual) {
    if (!hasYear) return [{}]
    const from = `${year}-${hasMonth ? String(month).padStart(2, '0') : '01'}-01`
    const to = hasMonth && month < 12 ? `${year}-${String(month + 1).padStart(2, '0')}-01` : `${year + 1}-01-01`
    return [{ from, to }, { or: `actual_date.lt.${from},actual_date.gte.${to}` }]
  }
  if (!hasYear && !hasMonth) return [{}]
  const exclude = [hasYear ? `year.neq.${year}` : '', hasMonth ? `month.neq.${month},month.is.null` : ''].filter(Boolean).join(',')
  return [{ ...(hasYear ? { year } : {}), ...(hasMonth ? { month } : {}) }, { or: exclude }]
}
