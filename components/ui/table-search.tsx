'use client'

import { useState } from 'react'
import { FilterX, Search } from 'lucide-react'

export function useTableSearch<Row>(rows: Row[], values: (row: Row) => unknown[]) {
  const [search, setSearch] = useState('')
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const filteredRows = terms.length ? rows.filter((row) => {
    const text = values(row).filter((value) => value != null).join(' ').toLocaleLowerCase()
    return terms.every((term) => text.includes(term))
  }) : rows
  return { search, setSearch, filteredRows }
}

export function TableSearch({ value, onChange, label, placeholder }: {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
}) {
  return (
    <div role="search" aria-label={label} className="relative mr-auto w-full sm:max-w-sm">
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder ?? 'Search here…'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border bg-background pr-10 pl-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="absolute top-1/2 right-1 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <FilterX aria-hidden="true" className="size-4" />
      </button>}
    </div>
  )
}
