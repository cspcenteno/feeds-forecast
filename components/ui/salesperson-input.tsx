'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePopupError } from '@/components/action-dialogs'
import { SearchableSelect } from '@/components/ui/searchable-select'

export function SalespersonInput({ value, onValueChange, disabled, placeholder }: {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}) {
  const [names, setNames] = useState<string[]>([])
  const [, reportError] = usePopupError()
  const loadNames = useCallback(() => {
    const controller = new AbortController()
    void fetch('/api/salesperson-names', { signal: controller.signal, cache: 'no-store' }).then(async (response) => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setNames(result.names)
    }).catch((error) => {
      if (!controller.signal.aborted) reportError(error instanceof Error ? error.message : 'Unable to load names.')
    })
    return () => controller.abort()
  }, [reportError])
  useEffect(loadNames, [loadNames])
  return <div onFocusCapture={loadNames}><SearchableSelect aria-label="Salesman" freeText value={value} onValueChange={onValueChange}
    disabled={disabled} placeholder={placeholder ?? 'Select or enter salesman…'}
    options={names.map((name) => ({ value: name, label: name }))} /></div>
}
