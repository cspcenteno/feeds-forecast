// The reporting month is the month containing the ISO week's Thursday.
export function reportingWeeksInMonth(year: number, month: number) {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const firstThursday = 1 + (4 - new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 7) % 7
  return Math.floor((days - firstThursday) / 7) + 1
}

export function weeklyBudget(monthlyBudget: number, year: number, month: number) {
  return monthlyBudget / reportingWeeksInMonth(year, month)
}
