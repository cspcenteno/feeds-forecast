import { SquareMinus, SquarePlus } from 'lucide-react'

export function ExpandCollapseIcon({ expanded }: { expanded: boolean }) {
  const Icon = expanded ? SquareMinus : SquarePlus
  return <Icon className="size-4 shrink-0" aria-hidden="true" />
}
