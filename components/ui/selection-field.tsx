'use client'

import type { ReactNode, FocusEventHandler } from 'react'
import { collectSelectionOptions, isSelectionAllowed } from '@/lib/selection-options'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { selectionText } from '@/lib/selection-text'

export function SelectionField({ value, onValueChange, children, className = '', loading = false, loadingText, ...props }: {
  value: string | number | null | undefined
  onValueChange?: (value: string) => void
  children: ReactNode
  id?: string
  name?: string
  disabled?: boolean
  loading?: boolean
  loadingText?: string
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
  const collectedOptions = collectSelectionOptions(children).map((option) => ({
    ...option,
    label: /^\s*(select|choose)\b/i.test(option.label)
      ? option.label.trim().replace(/^(select|choose)\s+(?:an?\s+)?/i, 'Select ').replace(/[.…]+$/, '') + '…'
      : option.label,
  }))
  const prompt = collectedOptions.find((option) => option.value === '' && /^(select|choose)\b/i.test(option.label))
  const options = collectedOptions.filter((option) => option !== prompt)
  const text = selectionText(props['aria-label'] ?? props.name)
  return <SearchableSelect {...props} disabled={loading || props.disabled} placeholder={loading ? loadingText ?? text.loading : props.placeholder ?? prompt?.label}
    inputHeightClassName={heightClasses || 'h-10'} value={loading ? '' : String(value ?? '')} options={loading ? [] : options}
    onValueChange={(nextValue) => { if (isSelectionAllowed(nextValue, options, props.freeText)) onValueChange?.(nextValue) }} className={widthClasses || 'w-full'} />
}
