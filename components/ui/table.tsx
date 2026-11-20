"use client"

import * as React from "react"
import { cn } from "cn"
import { TableSummary, type TableSummaryCounts } from '@/components/ui/table-summary'

type TableProps = Omit<React.ComponentProps<"table">, 'summary'> & {
  saved?: boolean
  containerProps?: React.ComponentProps<"div">
  summary?: TableSummaryCounts
  summaryEnd?: React.ReactNode
  summaryAlignColumn?: number
}

function Table({ className, containerProps, saved = false, summary, summaryEnd, summaryAlignColumn, ...props }: TableProps) {
  const { className: containerClassName, ...containerAttributes } = containerProps ?? {}
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const summaryEndRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const updateWidth = () => {
      container.style.setProperty('--table-viewport-width', `${container.clientWidth}px`)
      const pageContent = container.closest('[data-page-tables]')
      if (pageContent) {
        const summary = container.nextElementSibling
        const footerHeight = summary?.matches('[data-slot="table-summary"]') ? summary.getBoundingClientRect().height : 0
        let bottomSpace = footerHeight + 2
        let ancestor = container.parentElement
        while (ancestor) {
          const style = getComputedStyle(ancestor)
          const pixels = (value: string) => parseFloat(value) || 0
          const borders = pixels(style.borderTopWidth) + pixels(style.borderBottomWidth)
          const horizontalScrollbar = Math.max(0, ancestor.offsetHeight - ancestor.clientHeight - borders)
          bottomSpace += pixels(style.paddingBottom) + pixels(style.borderBottomWidth) + pixels(style.marginBottom) + horizontalScrollbar
          if (ancestor === pageContent) break
          ancestor = ancestor.parentElement
        }
        const pageTop = container.getBoundingClientRect().top + window.scrollY
        // Later tables on a dashboard get a useful viewport-sized limit too.
        const top = pageTop < window.innerHeight - bottomSpace - 192 ? Math.max(0, pageTop) : 160
        const availableHeight = Math.max(192, Math.floor(window.innerHeight - top - bottomSpace))
        container.style.setProperty('--page-table-max-height', `${availableHeight}px`)
      }
      const end = summaryEndRef.current
      const headers = container.querySelector('thead tr')?.children
      const header = headers?.[summaryAlignColumn ?? headers.length - 1]
      if (end && header && end.parentElement) {
        const columnRight = header.getBoundingClientRect().right
        const columnPadding = parseFloat(getComputedStyle(header).paddingRight) || 0
        const summaryPadding = parseFloat(getComputedStyle(end.parentElement).paddingRight) || 0
        const summaryRight = end.parentElement.getBoundingClientRect().right
        const inset = summaryRight - summaryPadding - columnRight + columnPadding
        end.style.setProperty('--summary-end-inset', `${Math.max(-summaryPadding, inset)}px`)
      }
    }
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(container)
    const table = container.querySelector('table')
    if (table) observer.observe(table)
    const headers = container.querySelector('thead tr')?.children
    const alignedHeader = headers?.[summaryAlignColumn ?? headers.length - 1]
    if (alignedHeader) observer.observe(alignedHeader)
    if (container.parentElement) observer.observe(container.parentElement)
    const summary = container.nextElementSibling
    if (summary?.matches('[data-slot="table-summary"]')) observer.observe(summary)
    container.addEventListener('scroll', updateWidth, { passive: true })
    window.addEventListener('resize', updateWidth)
    return () => {
      observer.disconnect()
      container.removeEventListener('scroll', updateWidth)
      window.removeEventListener('resize', updateWidth)
    }
  }, [summaryAlignColumn])

  return (
    <>
    <div
      ref={scrollRef}
      data-slot="table-container"
      className={cn("app-table-scroll @container relative isolate h-auto w-full max-h-[min(32rem,65vh)] overflow-auto", containerClassName)}
      {...containerAttributes}
    >
      <table
        data-slot="table"
        className={cn("min-w-[768px] caption-bottom text-sm [&>tbody>tr]:h-12", saved ? "w-[1600px]" : "w-full", className)}
        {...props}
      />
    </div>
    {summary && <TableSummary {...summary} end={summaryEnd} endRef={summaryEndRef} />}
    </>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
