'use client'

import { useId, type FocusEventHandler } from 'react'
import { Combobox } from '@base-ui/react/combobox'
import { Check, ChevronsUpDown } from 'lucide-react'
import { normalizeSelectionPrompt, selectionText } from '@/lib/selection-text'

export type SearchableOption = { value: string; label: string; disabled?: boolean; group?: string }

export function SearchableSelect({ label, value, options, onValueChange, disabled = false, placeholder, id: providedId, name, required, className = '', inputHeightClassName = 'h-10', multiline = false, freeText = false, onBlur, autoComplete = 'off', 'aria-label': ariaLabel, 'aria-describedby': ariaDescribedBy }: {
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
  multiline?: boolean
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
  const contentSize = /\bstatus\b/.test(fieldName) ? 'status'
    : /\bregion\b/.test(fieldName) ? 'month'
    : /customer|product|name|email|reason|kam|salesman|salesperson/.test(fieldName) ? 'long'
    : /year/.test(fieldName) ? 'year'
    : /week|status|role/.test(fieldName) ? 'short'
    : /month|^region$/.test(fieldName) ? 'month' : 'medium'
  const text = selectionText(fieldName)
  const hint = normalizeSelectionPrompt(placeholder ?? (/^search\b/.test(fieldName) ? `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}…` : freeText ? text.select.replace('Select ', 'Select or enter ') : options.length ? text.select : text.empty))
  const grouped = options.some((option) => option.group)
  const groups = [...new Set(options.map((option) => option.group ?? 'Other options'))].map((label) => ({ label, items: options.filter((option) => (option.group ?? 'Other options') === label) }))
  const renderOption = (option: SearchableOption) => <Combobox.Item key={option.value} value={option} disabled={option.disabled}
    className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-sidebar-accent data-highlighted:text-sidebar-accent-foreground data-disabled:cursor-default data-disabled:opacity-50">
    <span className={"min-w-0 flex-1 whitespace-normal break-words " + (multiline ? "text-xs leading-4" : "")}>{option.label}</span>
    <Combobox.ItemIndicator className="shrink-0"><Check className="size-4" aria-hidden="true" /></Combobox.ItemIndicator>
  </Combobox.Item>
  return (
    <div data-content-size={contentSize} className={'min-w-0 ' + (label ? 'space-y-1.5 ' : '') + className}>
      {label && <label htmlFor={id} className="block text-sm font-medium">{required && <span className="text-destructive" aria-hidden="true">* </span>}{label}</label>}
      <Combobox.Root items={grouped ? groups : options} value={selected} disabled={disabled} name={name} required={required} autoComplete={autoComplete}
        inputValue={freeText ? value : undefined}
        onInputValueChange={freeText ? (text, details) => {
          // Closing or blurring the list must not replace custom text with the
          // last selected option (or an empty label when no option matches).
          if (details.reason === 'input-change' || details.reason === 'input-clear' || details.reason === 'clear-press') onValueChange(text)
          else details.cancel()
        } : undefined}
        isItemEqualToValue={(a, b) => a.value === b.value}
        onValueChange={(option) => { if (option) onValueChange(option.value); else if (!freeText) onValueChange('') }}>
        <Combobox.InputGroup data-multiline-selection={multiline && selected ? '' : undefined} className="group/selection relative">
          <Combobox.Input id={id} placeholder={hint} onBlur={onBlur} aria-label={ariaLabel} aria-describedby={ariaDescribedBy}
            style={multiline ? { fontSize: '0.75rem', lineHeight: '1rem' } : undefined}
            className={'block w-full min-w-0 text-ellipsis rounded-md border bg-background pr-10 pl-3 text-base font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 disabled:opacity-60 sm:text-sm ' + inputHeightClassName + (multiline && selected ? ' text-transparent sm:text-transparent group-focus-within/selection:text-foreground' : '')} />
          {multiline && selected && (
            <div data-selected-label aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-10 left-3 flex items-center" title={selected.label}>
              <span className="line-clamp-2 wrap-anywhere" style={{ fontSize: '0.75rem', lineHeight: '1rem' }}>{selected.label}</span>
            </div>
          )}
          <Combobox.Trigger type="button" aria-label={'Show ' + (label ?? ariaLabel ?? 'selection').toLowerCase() + ' options'}
            className="absolute top-0 right-0 flex h-full w-10 items-center justify-center rounded-r-md text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
            <ChevronsUpDown className="size-4" aria-hidden="true" />
          </Combobox.Trigger>
        </Combobox.InputGroup>
        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} data-product-options={/product/.test(fieldName) ? '' : undefined} className="z-[120] w-[var(--anchor-width)] max-w-[calc(100vw-2rem)]">
            <Combobox.Popup className="max-h-[min(18rem,var(--available-height))] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
              <Combobox.Empty>
                <div className="px-3 py-4 text-sm text-muted-foreground">{freeText ? 'No matches. You can keep your entered text.' : options.length ? text.noMatches : text.empty}</div>
              </Combobox.Empty>
              <Combobox.List>
                {grouped ? (group: (typeof groups)[number]) => <Combobox.Group key={group.label} items={group.items}>
                  <Combobox.GroupLabel className="px-3 py-2 text-xs font-semibold text-muted-foreground">{group.label}</Combobox.GroupLabel>
                  <Combobox.Collection>{renderOption}</Combobox.Collection>
                </Combobox.Group> : renderOption}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  )
}
