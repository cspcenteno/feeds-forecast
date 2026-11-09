import { SquareCheck, Triangle, TriangleAlert } from 'lucide-react'
import { budgetComparison } from '@/lib/budget-comparison'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

export function BudgetValueIndicator({ value, budget, children, budgetLabel = 'budget', loading = false }: {
  value: number | null | undefined
  budget: number | null | undefined
  children: React.ReactNode
  budgetLabel?: string
  loading?: boolean
}) {
  if (loading) return <LoadingSpinner label="reference value" />
  const { state, ratio } = budgetComparison(value, budget)
  if (state === 'unavailable') return <span title="Value unavailable">—</span>
  const Icon = ratio === null ? null : ratio >= 100 ? SquareCheck : ratio >= 90 ? TriangleAlert : Triangle
  const color = ratio === null ? '' : ratio >= 100 ? 'text-emerald-600 dark:text-emerald-400'
    : ratio >= 90 ? 'text-amber-500 dark:text-amber-400' : 'text-red-500 dark:text-red-400'
  const status = ratio === null ? `No positive ${budgetLabel} available` : `${ratio.toFixed(1)}% of ${budgetLabel}: ${ratio >= 100 ? 'Target met' : ratio >= 90 ? 'Near target' : 'Below target'}`
  return <span className="inline-flex items-center justify-end gap-1.5" title={status}>
    {children}
    {Icon && <Icon role="img" aria-label={status} className={`size-4 shrink-0 ${color} ${ratio! < 90 ? 'rotate-180' : ''}`} />}
  </span>
}
