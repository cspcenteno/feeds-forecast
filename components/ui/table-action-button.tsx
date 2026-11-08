'use client'

import type { ComponentProps } from 'react'
import { Pencil, Send, Trash2 } from 'lucide-react'

type TableActionButtonProps = Omit<ComponentProps<'button'>, 'children'> & {
  action: 'edit' | 'delete' | 'submit' | 'discard'
}

export function TableActionButton({ action, title, 'aria-label': ariaLabel, ...props }: TableActionButtonProps) {
  const label = { edit: 'Edit', delete: 'Delete', submit: 'Submit', discard: 'Discard' }[action]
  const Icon = action === 'edit' ? Pencil : action === 'submit' ? Send : Trash2
  return (
    <button type="button" data-action-tone={action === 'edit' ? 'caution' : action === 'submit' ? 'transfer' : 'danger'}
      {...props} data-slot="table-action-button" title={title ?? label} aria-label={ariaLabel ?? title ?? label}>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span data-action-label>{label}</span>
    </button>
  )
}
