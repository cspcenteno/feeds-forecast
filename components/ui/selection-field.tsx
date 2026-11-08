'use client'

import type { ReactNode, FocusEventHandler } from 'react'
import { collectSelectionOptions, isSelectionAllowed } from '@/lib/selection-options'
import { SearchableSelect } from '@/components/ui/searchable-select'

export function SelectionField({ value, onValueChange, children, className = '', ...props }: {
  value: string | number | null | undefined
  onValueChange?: (value: string) => void
  children: ReactNode
  id?: string
  name?: string
  disabled?: boolean
  required?: boolean
  className?: string
  freeText?: boolean
  placeholder?: string
  onBlur?: FocusEventHandler<HTMLInputElement>
  autoComplete?: string
  'aria-label'?: string
  'aria-describedby'?: string
}) {
  const widthClasses = className.split(/\s+/).filter((item) => /^(?:(?:sm|md|lg|xl):)?(?:w-|min-w-|max-w-)/.test(item)).join(' ')
  const heightClasses = className.split(/\s+/).filter((item) => /^(?:(?:sm|md|lg|xl):)?h-/.test(item)).join(' ')
  const options = collectSelectionOptions(children)
  return <SearchableSelect {...props} inputHeightClassName={heightClasses || 'h-10'} value={String(value ?? '')} options={options}
    onValueChange={(nextValue) => { if (isSelectionAllowed(nextValue, options, props.freeText)) onValueChange?.(nextValue) }} className={widthClasses || 'w-full'} />
}
