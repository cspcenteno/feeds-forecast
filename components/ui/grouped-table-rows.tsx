'use client'

import { cloneElement, createContext, Fragment, isValidElement, useContext, useId, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

const GroupContext = createContext<{ keys: string[]; collapsed: Set<string>; setCollapsed: Dispatch<SetStateAction<Set<string>>> } | null>(null)

export function TableGroupProvider({ groupKeys, children }: { groupKeys: string[]; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  return <GroupContext.Provider value={{ keys: [...new Set(groupKeys)], collapsed, setCollapsed }}>{children}</GroupContext.Provider>
}

function useTableGroups() {
  const value = useContext(GroupContext)
  if (!value) throw new Error('TableGroupProvider is required.')
  return value
}

export function TableGroupToggle({ disabled = false }: { disabled?: boolean }) {
  const { keys, collapsed, setCollapsed } = useTableGroups()
  const allExpanded = keys.every((key) => !collapsed.has(key))
  return <button data-slot="expand-collapse-button" type="button" data-action-tone="neutral" disabled={disabled || !keys.length}
    className="shrink-0 rounded-md border px-3 py-2 text-sm"
    onClick={() => setCollapsed(allExpanded ? new Set(keys) : new Set())}>
    {allExpanded ? 'Collapse All' : 'Expand All'}
  </button>
}

export function GroupedTableRows<Row>({ rows, getGroup, columnCount, children }: {
  rows: readonly Row[]
  getGroup: (row: Row) => { key: string; label: string }
  columnCount: number
  children: (row: Row) => ReactNode
}) {
  const id = useId()
  const { collapsed, setCollapsed } = useTableGroups()
  const groups = new Map<string, { label: string; rows: Row[] }>()
  for (const row of rows) {
    const { key, label } = getGroup(row)
    const group = groups.get(key)
    if (group) group.rows.push(row)
    else groups.set(key, { label, rows: [row] })
  }
  const ordered = [...groups].sort((a, b) => a[1].label.localeCompare(b[1].label))

  return <>
    {ordered.map(([key, group], index) => {
      const expanded = !collapsed.has(key)
      const contentId = `${id}-${index}`
      return <Fragment key={key}>
        <tr className="border-b bg-muted/40">
          <td colSpan={columnCount} className="p-0">
            <button type="button" aria-expanded={expanded} aria-controls={contentId}
              className="flex w-full items-center gap-2 px-3 py-3 text-left text-sm font-semibold hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
              onClick={() => setCollapsed((current) => {
                const next = new Set(current)
                if (next.has(key)) next.delete(key)
                else next.add(key)
                return next
              })}>
              {expanded ? <ChevronDown className="size-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="size-4 shrink-0" aria-hidden="true" />}
              <span className="min-w-0 wrap-anywhere">{group.label}</span>
              <span className="text-xs font-normal text-muted-foreground">({group.rows.length})</span>
            </button>
          </td>
        </tr>
        {group.rows.map((row, rowIndex) => <Fragment key={rowIndex}>
          <GroupedRowContent id={rowIndex === 0 ? contentId : undefined} hidden={!expanded}>{children(row)}</GroupedRowContent>
        </Fragment>)}
      </Fragment>
    })}
  </>
}

// A row group cannot contain a div; clone the supplied table row instead.
function GroupedRowContent({ id, hidden, children }: { id?: string; hidden: boolean; children: ReactNode }) {
  return isValidElement<{ id?: string; hidden?: boolean }>(children) ? cloneElement(children, { id, hidden }) : children
}
