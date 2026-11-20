export function isoWeekStart(year: number, week: number) {
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(week)) throw new Error('Invalid forecast year or week.')
  const jan1 = new Date(Date.UTC(year, 0, 1)).getUTCDay()
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const count = jan1 === 4 || (jan1 === 3 && leap) ? 53 : 52
  if (week < 1 || week > count) throw new Error(`Year ${year} has ${count} ISO weeks.`)
  const date = new Date(Date.UTC(year, 0, 4))
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() || 7) + 1 + (week - 1) * 7)
  return date.toISOString().slice(0, 10)
}

export function weekInputDate(value: string) {
  const match = /^(\d{4})-W(\d{2})$/.exec(value)
  if (!match) throw new Error('Select a valid week.')
  return isoWeekStart(Number(match[1]), Number(match[2]))
}

export function currentWeekInput(now = new Date()) {
  const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const date = new Date(localDate + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const year = date.getUTCFullYear()
  const week = Math.ceil(((date.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

export function salesWeekRange(now = new Date()) {
  const fromWeek = currentWeekInput(now)
  const end = new Date(weekInputDate(fromWeek) + 'T00:00:00Z')
  end.setUTCDate(end.getUTCDate() + 21)
  return { fromWeek, toWeek: currentWeekInput(end) }
}
