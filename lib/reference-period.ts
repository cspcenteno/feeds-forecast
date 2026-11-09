export function referencePeriod(year: number, month: number, previous = false) {
  return previous ? { year: month === 1 ? year - 1 : year, month: month === 1 ? 12 : month - 1 } : { year, month }
}
