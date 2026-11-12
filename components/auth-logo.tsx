import { ShieldLock } from 'lucide-react'

export function AuthLogo() {
  return (
    <div aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400">
      <ShieldLock className="size-6" strokeWidth={2} />
    </div>
  )
}
