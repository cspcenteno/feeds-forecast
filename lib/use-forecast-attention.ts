'use client'

import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

export type ForecastAttention = {
  returned: { id: number; remarks: string | null; returned_by: string | null; returned_at: string | null; reviewer: string }[]
  returnedCustomers: number
  pending: number
  endorsed: number
}

const ForecastAttentionContext = createContext<ForecastAttention | null>(null)

export function ForecastAttentionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [attention, setAttention] = useState<ForecastAttention | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    let loading = false
    async function refresh() {
      if (loading || controller.signal.aborted) return
      loading = true
      try {
        const response = await fetch('/api/forecast-attention', { cache: 'no-store', signal: controller.signal })
        if (response.status === 401 || response.status === 403) {
          if (!controller.signal.aborted) setAttention(null)
          return
        }
        if (!response.ok) throw new Error('Unable to load notifications')
        const data = await response.json() as ForecastAttention
        if (!controller.signal.aborted) setAttention(data)
      } catch { /* Keep the last confirmed counts during navigation or temporary failures. */ }
      finally { loading = false }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 60000)
    window.addEventListener('focus', refresh)
    window.addEventListener('forecast-workflow-changed', refresh)
    return () => {
      controller.abort()
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('forecast-workflow-changed', refresh)
    }
  }, [pathname])
  return createElement(ForecastAttentionContext.Provider, { value: attention }, children)
}

export function useForecastAttention() {
  return useContext(ForecastAttentionContext)
}
