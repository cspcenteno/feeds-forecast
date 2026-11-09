type StatusBadgeProps = { status: string }

const tones: Record<string, string> = {
  active: 'positive', open: 'positive', approved: 'positive', ready: 'positive', created: 'positive',
  locked: 'negative', inactive: 'negative', rejected: 'negative', returned: 'negative', invalid: 'negative', failed: 'negative',
  pending: 'warning', submitted: 'warning', duplicate: 'warning', 'duplicate in staging': 'warning',
  endorsed: 'info', 'already imported': 'info',
}

const colors: Record<string, string> = {
  positive: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  negative: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  neutral: 'bg-muted text-muted-foreground',
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-1 text-sm font-semibold leading-5 ${colors[tones[status.toLowerCase()] ?? 'neutral']}`}>{status}</span>
}
