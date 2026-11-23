import { SquareMinus, SquarePlus } from 'lucide-react'
import type { ComponentProps } from 'react'

export function HeaderExpandCollapseButton({ expanded, empty = false, loading = false, disabled, ...props }: Omit<ComponentProps<'button'>, 'children'> & { expanded: boolean; empty?: boolean; loading?: boolean }) {
  const label = expanded ? 'Collapse all groups' : 'Expand all groups'
  return <button type="button" data-slot="hierarchy-expand-button" aria-label={label} title={loading ? 'Loading groups…' : empty ? 'No groups to expand' : label} disabled={disabled || loading || empty}
    className="inline-flex size-10 shrink-0 items-center justify-center rounded text-muted-foreground enabled:hover:bg-muted enabled:hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 md:size-8"
    {...props}><ExpandCollapseIcon expanded={expanded} /></button>
}

export function ExpandCollapseIcon({ expanded }: { expanded: boolean }) {
  const Icon = expanded ? SquareMinus : SquarePlus
  return <><Icon className="size-4 shrink-0" aria-hidden="true" /><span className="sr-only md:hidden">{expanded ? 'Collapse All' : 'Expand All'}</span></>
}
