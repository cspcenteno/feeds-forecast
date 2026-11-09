'use client'

import { useId, type FocusEventHandler } from 'react'
import { Combobox } from '@base-ui/react/combobox'
import { Check, ChevronsUpDown } from 'lucide-react'

export type SearchableOption = { value: string; label: string; disabled?: boolean }

export function SearchableSelect({ label, value, options, onValueChange, disabled = false, placeholder, id: providedId, name, required, className = '', inputHeightClassName = 'h-10', freeText = false, onBlur, autoComplete = 'off', 'aria-label': ariaLabel, 'aria-describedby': ariaDescribedBy }: {
  label?: string
  value: string
  options: SearchableOption[]
  onValueChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  id?: string
  name?: string
  required?: boolean
  className?: string
  inputHeightClassName?: string
  freeText?: boolean
  onBlur?: FocusEventHandler<HTMLInputElement>
  autoComplete?: string
  'aria-label'?: string
  'aria-describedby'?: string
}) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  const selected = options.find((option) => option.value === value)
    ?? (freeText && value ? { value, label: value } : null)
  const fieldName = (label ?? ariaLabel ?? name ?? 'option').replace(/[*:]/g, '').trim().toLowerCase()
  // Width follows the field's purpose, never its currently available choices.
  const contentSize = /customer|product|name|email|reason|kam|salesman/.test(fieldName) ? 'long'
    : /year/.test(fieldName) ? 'year'
    : /week|status|role/.test(fieldName) ? 'short'
    : /month|^region$/.test(fieldName) ? 'month' : 'medium'
  const hint = placeholder ?? (/^search\b/.test(fieldName) ? `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}…` : `${freeText ? 'Enter' : 'Select'} ${fieldName}…`)
  return (
    <div data-content-size={contentSize} className={'min-w-0 ' + (label ? 'space-y-1.5 ' : '') + className}>
      {label && <label htmlFor={id} className="block text-sm font-medium">{label}</label>}
      <Combobox.Root items={options} value={selected} disabled={disabled} name={name} required={required} autoComplete={autoComplete}
        inputValue={freeText ? value : undefined}
        onInputValueChange={freeText ? (text, details) => {
          // Closing or blurring the list must not replace custom text with the
          // last selected option (or an empty label when no option matches).
          if (details.reason === 'input-change' || details.reason === 'input-clear' || details.reason === 'clear-press') onValueChange(text)
          else details.cancel()
        } : undefined}
        isItemEqualToValue={(a, b) => a.value === b.value}
        onValueChange={(option) => { if (option) onValueChange(option.value); else if (!freeText) onValueChange('') }}>
        <Combobox.InputGroup className="relative">
          <Combobox.Input id={id} placeholder={hint} onBlur={onBlur} aria-label={ariaLabel} aria-describedby={ariaDescribedBy}
            className={'block w-full min-w-0 text-ellipsis rounded-md border bg-background pr-10 pl-3 text-base font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 disabled:opacity-60 sm:text-sm ' + inputHeightClassName} />
          <Combobox.Trigger type="button" aria-label={'Show ' + (label ?? ariaLabel ?? 'selection').toLowerCase() + ' options'}
            className="absolute top-0 right-0 flex h-full w-10 items-center justify-center rounded-r-md text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
            <ChevronsUpDown className="size-4" aria-hidden="true" />
          </Combobox.Trigger>
        </Combobox.InputGroup>
        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} className="z-[120] w-[var(--anchor-width)] max-w-[calc(100vw-2rem)]">
            <Combobox.Popup className="max-h-[min(18rem,var(--available-height))] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
              <Combobox.Empty>
                <div className="px-3 py-4 text-sm text-muted-foreground">{freeText ? 'No matches. You can keep your entered text.' : 'No matches found.'}</div>
              </Combobox.Empty>
              <Combobox.List>
                {(option: SearchableOption) => <Combobox.Item key={option.value} value={option} disabled={option.disabled}
                  className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-sidebar-accent data-highlighted:text-sidebar-accent-foreground data-disabled:cursor-default data-disabled:opacity-50">
                  <span className="min-w-0 flex-1 whitespace-normal break-words">{option.label}</span>
                  <Combobox.ItemIndicator className="shrink-0"><Check className="size-4" aria-hidden="true" /></Combobox.ItemIndicator>
                </Combobox.Item>}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  )
}
