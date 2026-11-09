export function budgetComparison(value: number | null | undefined, budget: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return { state: 'unavailable', ratio: null } as const
  if (budget == null || !Number.isFinite(budget) || budget <= 0) return { state: 'unrated', ratio: null } as const
  const ratio = value / budget * 100
  if (!Number.isFinite(ratio)) return { state: 'unrated', ratio: null } as const
  return { state: ratio >= 100 ? 'met' : ratio >= 90 ? 'near' : 'below', ratio } as const
}
