"use client"

import * as React from "react"
import { cn } from "cn"
import { TableSummary, type TableSummaryCounts } from '@/components/ui/table-summary'

type TableProps = Omit<React.ComponentProps<"table">, 'summary'> & {
  saved?: boolean
  containerProps?: React.ComponentProps<"div">
  summary?: TableSummaryCounts
}

function Table({ className, containerProps, saved = false, summary, ...props }: TableProps) {
  const { className: containerClassName, ...containerAttributes } = containerProps ?? {}
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const updateWidth = () => {
      container.style.setProperty('--table-viewport-width', `${container.clientWidth}px`)
    }
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

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
    {summary && <TableSummary {...summary} />}
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
