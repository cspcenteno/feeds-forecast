'use client'

import { usePopupError } from '@/components/action-dialogs'

import { sortRegions } from '@/lib/region-order'

import { StatusBadge } from '@/components/ui/status-badge'

import { MapPin as HeadingMapPin } from 'lucide-react'

import { formatCreatedDate } from '@/lib/format-created-date'
import { RecordDialog } from '@/components/ui/record-dialog'
import { Plus as AddRecordIcon } from 'lucide-react'
import { Save as ActionSaveIcon, X as ActionXIcon } from 'lucide-react'
import { ActiveField } from '@/components/ui/active-field'

import { useActionDialogs } from '@/components/action-dialogs'
import { TableActionButton } from '@/components/ui/table-action-button'
import { TableLoadingRow } from '@/components/ui/loading-spinner'
import { useEffect, useState } from 'react'
import { SortableHeader, useTableSort } from '@/components/ui/sortable-header'
import { createClient } from '@/lib/client'
import { useAuthorization } from '@/lib/authorization'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Region = {
  created_at: string | null
  id: number
  name: string
  code: string | null
  is_active: boolean
}

export default function RegionsPage() {
  const { confirmAction } = useActionDialogs()

  const authorization = useAuthorization()
  const [regions, setRegions] = useState<Region[]>([])

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [isActive, setIsActive] = useState(true)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const [, setError] = usePopupError()
  const [loading, setLoading] = useState(false)
  const [tableLoading, setTableLoading] = useState(true)

  async function getRegions() {
    setTableLoading(true)
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('regions')
        .select('id, name, code, is_active, created_at')
        .order('id')

      if (error) {
        setError(error.message)
        return
      }

      setRegions(sortRegions(data ?? []))

    } finally {
      setTableLoading(false)
    }
  }

  async function saveRegion() {
    if (!authorization.can('Regions', editingId === null ? 'add' : 'edit')) return
    setError(null)

    if (!name.trim()) {
      setError('Region Name is required.')
      return
    }

    setLoading(true)

    const supabase = createClient()

    if (editingId !== null) {
      const { data, error } = await supabase
        .from('regions')
        .update({
          name: name.trim(),
          code: code.trim() || null,
          is_active: isActive,
        })
        .eq('id', editingId)
        .select()

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      if (!data || data.length === 0) {
        setError(
          'No region was updated. Check your RLS UPDATE policy.'
        )
        setLoading(false)
        return
      }
    } else {
      const { data, error } = await supabase
        .from('regions')
        .insert({
          name: name.trim(),
          code: code.trim() || null,
          is_active: isActive,
        })
        .select()

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      if (!data || data.length === 0) {
        setError('Region was not added.')
        setLoading(false)
        return
      }
    }

    // Refresh table from Supabase
    await getRegions()

    clearForm()
    setLoading(false)
  }

  function editRegion(region: Region) {
    if (!authorization.can('Regions', 'edit')) return
    setEditingId(region.id)
    setFormOpen(true)
    setName(region.name)
    setCode(region.code ?? '')
    setIsActive(region.is_active)
    setError(null)
  }

  async function deleteRegion(id: number) {
    let actionConfirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
    if (!authorization.can('Regions', 'delete')) return
    const confirmed = (actionConfirmation = await confirmAction({ message: 'Are you sure you want to delete this region?', details: [{ label: 'Region', value: regions.find((item) => item.id === id)?.name || '#' + id }] }))

    if (!confirmed) {
      return
    }

    setError(null)
    setLoading(true)

    const supabase = createClient()

    const { error } = await supabase
      .from('regions')
      .delete()
      .eq('id', id)

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (editingId === id) {
      clearForm()
    }

    // Refresh table from Supabase
    await getRegions()

    setLoading(false)

    } finally { actionConfirmation?.finish() }
  }

  function clearForm() {
    setFormOpen(false)
    setEditingId(null)
    setName('')
    setCode('')
    setIsActive(true)
    setError(null)
  }

  useEffect(() => {
    getRegions()
  }, [])

  const { sortedRows: sortedRegions, sortHeader } = useTableSort(regions, {
    created_at: (row) => row.created_at,
    code: (row) => row.code,
    name: (row) => row.name,
  }, ['name'])

  return (
    <main className="space-y-4">


      {/* Form */}
      {authorization.can('Regions', 'add') || editingId !== null ? <RecordDialog open={formOpen} onClose={clearForm} title={editingId === null ? 'Add Region' : 'Edit Region'} busy={loading}>
        <div className="mb-5">
          <h2 data-section-title="" className="font-semibold"><HeadingMapPin className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />
            {editingId !== null
              ? 'Edit Region'
              : 'Add Region'}
          </h2>


        </div>

        <div className="app-field-row">
          {/* Region Name */}
          <div className="space-y-2">
            <label
              htmlFor="name"
              className="text-sm font-medium"
            >
              Region Name
            </label>

            <input
              id="name"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              placeholder="Enter region name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Code */}
          <div data-field-size="compact" className="space-y-2">
            <label
              htmlFor="code"
              className="text-sm font-medium"
            >
              Code
            </label>

            <input
              id="code"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm uppercase outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              placeholder="Enter region code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>

          {/* Active */}
          <div data-field-size="toggle" className="flex items-end">
            <ActiveField
                checked={isActive}
                onChange={(e) =>
                  setIsActive(e.target.checked)
                }
              />
          </div>
        </div>

        {/* Buttons */}
        <div data-action-toolbar="" className="mt-5 flex gap-2">
          <button data-action-tone="primary" data-action-fill=""
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={saveRegion}
            disabled={loading || !authorization.can('Regions', editingId === null ? 'add' : 'edit')}
          ><ActionSaveIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />
            {loading
              ? 'Saving...'
              : editingId !== null
                ? 'Save Changes'
                : 'Add Region'}
          </button>


            <button data-action-tone="neutral"
              className="inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
              onClick={clearForm}
              disabled={loading}
            ><ActionXIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />
              Cancel
            </button>
        </div>
        {/* Error */}

      </RecordDialog> : null}

      {/* Table */}
      <section className="rounded-xl border bg-card shadow-sm">
        <div data-section-header="" data-action-toolbar="" className="flex flex-wrap items-center justify-end gap-2 border-b px-4 py-3">{authorization.can('Regions', 'add') && <button type="button" data-action-tone="primary" data-action-fill="" onClick={() => { clearForm(); setFormOpen(true) }} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium"><AddRecordIcon className="size-4" aria-hidden="true" />Add Region</button>}</div>

        <div className="overflow-x-auto">
          <Table summary={{ records: sortedRegions.length }} saved aria-busy={tableLoading}>
            <TableHeader>
              <TableRow>
                {(authorization.can('Regions', 'add') || authorization.can('Regions', 'edit') || authorization.can('Regions', 'delete')) && <TableHead data-action-column="standard" className="w-[180px] text-left">Action</TableHead>}
                <TableHead data-fixed-column="status" className="w-[120px]">Status</TableHead>
                <SortableHeader className="pl-6 w-[150px]" {...sortHeader('code')}>Code</SortableHeader>

                <SortableHeader {...sortHeader('name')}>Region Name</SortableHeader>

              <SortableHeader className="w-[200px] px-3" {...sortHeader('created_at')}>Date Created</SortableHeader></TableRow>
            </TableHeader>

            <TableBody>
              {tableLoading ? (
                <TableLoadingRow columns={authorization.can('Regions', 'add') || authorization.can('Regions', 'edit') || authorization.can('Regions', 'delete') ? 5 : 4} label="regions" />
              ) : regions.length > 0 ? (
                sortedRegions.map((region) => (
                  <TableRow key={region.id}>
                    {(authorization.can('Regions', 'add') || authorization.can('Regions', 'edit') || authorization.can('Regions', 'delete')) && <TableCell data-action-column="standard">
                      {authorization.can('Regions', 'edit') || authorization.can('Regions', 'delete') ? <div className="flex justify-start gap-2">
                        {authorization.can('Regions', 'edit') && <TableActionButton action="edit" data-action-tone="caution"
                          className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
                          onClick={() => editRegion(region)}
                          disabled={!authorization.can('Regions', 'edit')}
                         />}
                        {authorization.can('Regions', 'delete') && <TableActionButton action="delete" data-action-tone="danger"
                          className="rounded-md border border-destructive/30 px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                          onClick={() => deleteRegion(region.id)}
                          disabled={!authorization.can('Regions', 'delete')}
                         />}
                      </div> : <span className="text-sm text-muted-foreground">No Action</span>}
                    </TableCell>}
                    <TableCell>
                      <StatusBadge status={region.is_active ? 'Active' : 'Inactive'} />
                    </TableCell>
                    <TableCell className="pl-6 font-medium">
                      {region.code || '—'}
                    </TableCell>

                    <TableCell>
                      {region.name}
                    </TableCell>

                  <TableCell className="px-3 whitespace-nowrap">{formatCreatedDate(region.created_at)}</TableCell></TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={authorization.can('Regions', 'add') || authorization.can('Regions', 'edit') || authorization.can('Regions', 'delete') ? 5 : 4}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No regions to display.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </main>
  )
}
