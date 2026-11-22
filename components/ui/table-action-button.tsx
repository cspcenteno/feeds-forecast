'use client'

import type { ComponentProps } from 'react'
import { Ban, Pencil, Send, Trash2 } from 'lucide-react'

type TableActionButtonProps = Omit<ComponentProps<'button'>, 'children'> & {
  action: 'edit' | 'delete' | 'submit' | 'discard' | 'void'
  compact?: boolean
  count?: number
}

export function TableActionButton({ action, compact = false, count, title, 'aria-label': ariaLabel, ...props }: TableActionButtonProps) {
  const actionLabel = { edit: 'Edit', delete: 'Delete', submit: 'Submit', discard: 'Discard', void: 'Void' }[action]
  const label = count === undefined || count <= 1 ? actionLabel : `${actionLabel} (${count})`
  const Icon = action === 'edit' ? Pencil : action === 'submit' ? Send : action === 'void' ? Ban : Trash2
  return (
    <button type="button" data-action-tone={action === 'edit' ? 'caution' : action === 'submit' ? 'transfer' : 'danger'}
      {...props} data-compact-action={compact ? '' : undefined} data-slot="table-action-button" title={title ?? label} aria-label={ariaLabel ?? title ?? label}>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span data-action-label style={compact ? { display: 'none' } : undefined}>{label}</span>
    </button>
  )
}
