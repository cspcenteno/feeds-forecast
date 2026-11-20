'use client'

import { useLayoutEffect, useRef, type ComponentProps } from 'react'
import { Table } from '@/components/ui/table'

export function ForecastEntryTable({ scrollToLastRowRequest = 0, ...props }: ComponentProps<typeof Table> & {
  scrollToLastRowRequest?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    const table = container?.querySelector('table')
    if (!container || !table) return

    const updateHeight = () => {
      const rows = Array.from(table.tBodies[0]?.rows ?? []).slice(0, window.matchMedia('(max-width: 767px)').matches ? 2 : 4)
      const bodyHeight = rows.reduce((height, row) => height + row.getBoundingClientRect().height, 0)
      const headerHeight = table.tHead?.getBoundingClientRect().height ?? 0
      const footerHeight = table.tFoot?.getBoundingClientRect().height ?? 0
      const frameHeight = container.offsetHeight - container.clientHeight
      container.style.maxHeight = `${Math.ceil(headerHeight + bodyHeight + footerHeight + frameHeight)}px`
    }

    updateHeight()
    window.addEventListener('resize', updateHeight)
    const observer = new ResizeObserver(updateHeight)
    observer.observe(table)
    observer.observe(container)
    for (const section of [table.tHead, table.tBodies[0], table.tFoot]) {
      if (section) observer.observe(section)
    }
    return () => { observer.disconnect(); window.removeEventListener('resize', updateHeight) }
  }, [])

  useLayoutEffect(() => {
    if (!scrollToLastRowRequest) return
    const frame = requestAnimationFrame(() => {
      const container = containerRef.current
      if (container) container.scrollTop = container.scrollHeight
    })
    return () => cancelAnimationFrame(frame)
  }, [scrollToLastRowRequest])

  return <Table {...props} containerProps={{
    ...props.containerProps,
    ref: containerRef,
    tabIndex: 0,
    role: 'region',
    'aria-label': 'Forecast row inputs',
  }} />
}
