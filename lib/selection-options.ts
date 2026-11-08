import { Children, isValidElement, type ReactNode } from 'react'

export type SelectionOption = { value: string; label: string; disabled?: boolean }

export function isSelectionAllowed(value: string, options: SelectionOption[], freeText = false) {
  return freeText || options.some((option) => option.value === value && !option.disabled)
}

function optionText(children: ReactNode): string {
  return Children.toArray(children).map((child): string => {
    if (typeof child === 'string' || typeof child === 'number') return String(child)
    return isValidElement<{ children?: ReactNode }>(child) ? optionText(child.props.children) : ''
  }).join('')
}

export function collectSelectionOptions(children: ReactNode): SelectionOption[] {
  const options = new Map<string, SelectionOption>()
  function collect(nodes: ReactNode, disabled = false) {
    Children.forEach(nodes, (child) => {
      if (!isValidElement<{ children?: ReactNode; value?: string | number; disabled?: boolean }>(child)) return
      if (child.type === 'option') {
        const label = optionText(child.props.children).trim() || String(child.props.value ?? '')
        const value = String(child.props.value ?? label)
        if (!options.has(value)) options.set(value, { value, label, disabled: disabled || child.props.disabled })
      } else collect(child.props.children, disabled || Boolean(child.props.disabled))
    })
  }
  collect(children)
  return [...options.values()]
}
