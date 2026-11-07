'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import { TableHead } from '@/components/ui/table'

type Direction = 'ascending' | 'descending'

export function useTableSort<Row, Key extends string>(
  rows: Row[],
  values: Record<Key, (row: Row) => string | null>,
) {
  const [sort, setSort] = useState<{ key: Key; direction: Direction } | null>(null)

  const sortedRows = sort ? [...rows].sort((first, second) => {
    const getValue = values[sort.key]
    const comparison = (getValue(first) ?? '').localeCompare(
      getValue(second) ?? '',
      undefined,
      { numeric: true, sensitivity: 'base' },
    )
    return sort.direction === 'ascending' ? comparison : -comparison
  }) : rows

  function sortHeader(key: Key) {
    return {
      direction: sort?.key === key ? sort.direction : undefined,
      onSort: () => setSort((current) => ({
        key,
        direction: current?.key === key && current.direction === 'ascending'
          ? 'descending'
          : 'ascending',
      })),
    }
  }

  return { sortedRows, sortHeader }
}

export function SortableHeader({
  children,
  className,
  direction,
  onSort,
  plain = false,
}: {
  children: ReactNode
  className?: string
  direction?: Direction
  onSort: () => void
  plain?: boolean
}) {
  const Head = plain ? 'th' : TableHead
  const Icon = direction === 'ascending' ? ChevronUp : direction === 'descending' ? ChevronDown : ChevronsUpDown

  return (
    <Head scope="col" className={className} aria-sort={direction}>
      <button
        type="button"
        onClick={onSort}
        className="inline-flex cursor-pointer items-center gap-1 rounded-sm focus-visible:outline-2"
      >
        {children}
        <Icon aria-hidden="true" className={direction ? 'size-4' : 'size-4 text-muted-foreground'} />
      </button>
    </Head>
  )
}
