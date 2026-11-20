
'use client'

import { TableSearch, useTableSearch } from '@/components/ui/table-search'

import { summaryForLevel } from '@/lib/table-summary-level'

import { usePopupError } from '@/components/action-dialogs'

import { sortRegions } from '@/lib/region-order'

import { StatusBadge } from '@/components/ui/status-badge'

import { MapPinned as HeadingMapPinned } from 'lucide-react'

import { formatCreatedDate } from '@/lib/format-created-date'
import { RecordDialog } from '@/components/ui/record-dialog'
import { Plus as AddRecordIcon } from 'lucide-react'
import { Save as ActionSaveIcon, X as ActionXIcon } from 'lucide-react'
import { ActiveField } from '@/components/ui/active-field'

import { useActionDialogs } from '@/components/action-dialogs'
import { SelectionField } from '@/components/ui/selection-field'
import { TableActionButton } from '@/components/ui/table-action-button'
import { TableLoadingRow } from '@/components/ui/loading-spinner'
import { GroupedTableRows, TableGroupProvider, TableGroupToggle } from '@/components/ui/grouped-table-rows'
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
  id: number
  name: string
  code: string | null
  is_active: boolean | null
}

type Subregion = {
  id: number
  name: string
  code: string | null
  region_id: number
  is_active: boolean | null
  created_at: string | null
}

export default function SubregionsPage() {
  const { confirmAction } = useActionDialogs()

  const authorization = useAuthorization()
  const [subregions, setSubregions] = useState<Subregion[]>([])
  const [regions, setRegions] = useState<Region[]>([])

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [regionId, setRegionId] = useState('')
  const [isActive, setIsActive] = useState(true)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [, setError] = usePopupError()
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)

  async function getData() {
    const supabase = createClient()

    setError(null)

    const [regionsResult, subregionsResult] = await Promise.all([
      supabase
        .from('regions')
        .select('id, name, code, is_active')
        .order('name'),

      supabase
        .from('subregions')
        .select('id, name, code, region_id, is_active, created_at')
        .order('name'),
    ])

    if (regionsResult.error) {
      setError(`Unable to load regions: ${regionsResult.error.message}`)
      setInitialLoading(false)
      return
    }

    if (subregionsResult.error) {
      setError(
        `Unable to load subregions: ${subregionsResult.error.message}`
      )
      setInitialLoading(false)
      return
    }

    setRegions(sortRegions(regionsResult.data ?? []))
    setSubregions(subregionsResult.data ?? [])
    setInitialLoading(false)
  }

  async function saveSubregion() {
    if (!authorization.can('Subregions', editingId === null ? 'add' : 'edit')) return
    setError(null)

    if (!name.trim()) {
      setError('Subregion Name is required.')
      return
    }

    if (!regionId) {
      setError('Please select a parent region.')
      return
    }

    const selectedRegion = regions.find(
      (region) => region.id === Number(regionId)
    )

    if (!selectedRegion) {
      setError('Please select a valid region.')
      return
    }

    setLoading(true)

    const supabase = createClient()

    const payload = {
      name: name.trim(),
      code: code.trim() || null,
      region_id: Number(regionId),
      is_active: isActive,
    }

    if (editingId !== null) {
      const { data, error } = await supabase
        .from('subregions')
        .update(payload)
        .eq('id', editingId)
        .select('id')

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      if (!data || data.length === 0) {
        setError(
          'No subregion was updated. Check your RLS UPDATE policy.'
        )
        setLoading(false)
        return
      }
    } else {
      const { data, error } = await supabase
        .from('subregions')
        .insert(payload)
        .select('id')

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      if (!data || data.length === 0) {
        setError(
          'Subregion was not added. Check your RLS INSERT policy.'
        )
        setLoading(false)
        return
      }
    }

    await getData()
    clearForm()
    setLoading(false)
  }

  function editSubregion(subregion: Subregion) {
    setEditingId(subregion.id)
    setFormOpen(true)
    setName(subregion.name)
    setCode(subregion.code ?? '')
    setRegionId(String(subregion.region_id))
    setIsActive(subregion.is_active ?? true)
    setError(null)
  }

  async function deleteSubregion(id: number) {
    let actionConfirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
    if (!authorization.can('Subregions', 'delete')) return
    const confirmed = (actionConfirmation = await confirmAction({ message: 'Are you sure you want to delete this subregion?', details: [{ label: 'Subregion', value: subregions.find((item) => item.id === id)?.name || '#' + id }] }))

    if (!confirmed) return

    setError(null)
    setLoading(true)

    const supabase = createClient()

    const { data, error } = await supabase
      .from('subregions')
      .delete()
      .eq('id', id)
      .select('id')

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (!data || data.length === 0) {
      setError(
        'No subregion was deleted. Check your RLS DELETE policy.'
      )
      setLoading(false)
      return
    }

    if (editingId === id) {
      clearForm()
    }

    await getData()
    setLoading(false)

    } finally { actionConfirmation?.finish() }
  }

  function clearForm() {
    setFormOpen(false)
    setEditingId(null)
    setName('')
    setCode('')
    setRegionId('')
    setIsActive(true)
    setError(null)
  }

  useEffect(() => {
    getData()
  }, [])

  const { search, setSearch, filteredRows } = useTableSearch(subregions, (row) => [row.code, row.name, regions.find((region) => region.id === row.region_id)?.name, row.is_active ? 'Active' : 'Inactive'])

  const { sortedRows: sortedSubregions, sortHeader } = useTableSort(filteredRows, {
    created_at: (row) => row.created_at,
    code: (row) => row.code,
    name: (row) => row.name,
    region: (row) => regions.find((region) => region.id === row.region_id)?.name ?? null,
  })

  return (
    <main className="space-y-4">


      {/* Subregion Form */}
      {authorization.can('Subregions', 'add') || editingId !== null ? <RecordDialog open={formOpen} onClose={clearForm} title={editingId === null ? 'Add Subregion' : 'Edit Subregion'} busy={loading}>
        <div className="mb-5" data-popup-form-header="">
          <h2 data-section-title="" className="font-semibold"><HeadingMapPinned className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />
            {editingId !== null
              ? 'Edit Subregion'
              : 'Add Subregion'}
          </h2>


        </div>

        <div className="app-field-row">
          {/* Subregion Name */}
          <div className="space-y-2">
            <label
              htmlFor="subregion-name"
              className="text-sm font-medium"
            >
              Subregion Name
            </label>

            <input
              id="subregion-name"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              placeholder="Enter subregion name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Code */}
          <div data-field-size="compact" className="space-y-2">
            <label
              htmlFor="subregion-code"
              className="text-sm font-medium"
            >
              Code
            </label>

            <input
              id="subregion-code"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm uppercase outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              placeholder="Enter subregion code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Parent Region */}
          <div className="space-y-2">
            <label
              htmlFor="parent-region"
              className="text-sm font-medium"
            >
              Parent Region
            </label>

            <SelectionField id="parent-region"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
                  value={regionId}
                  onValueChange={(selectionValue) => setRegionId(selectionValue)}
                  disabled={loading}
                  aria-label="Parent Region">
              <option value="">Select a region</option>

              {regions.map((region) => (
                <option
                  key={region.id}
                  value={region.id}
                  disabled={region.is_active === false}
                >
                  {region.name}
                  {region.is_active === false ? ' (Inactive)' : ''}
                </option>
              ))}
            </SelectionField>
          </div>

          {/* Active */}
          <div data-field-size="toggle" className="flex items-end">
            <ActiveField
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={loading}
              />
          </div>
        </div>

        {/* Buttons */}
        <div data-action-toolbar="" className="mt-5 flex gap-2" data-dialog-footer="">
          <button data-action-tone="neutral"
              className="inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              onClick={clearForm}
              disabled={loading}
            ><ActionXIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />
              Cancel
            </button>


            <button data-action-tone="primary" data-action-fill=""
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={saveSubregion}
            disabled={loading || initialLoading || !authorization.can('Subregions', editingId === null ? 'add' : 'edit')}
          ><ActionSaveIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />
            {loading
              ? 'Saving...'
              : editingId !== null
                ? 'Save Changes'
                : 'Add Subregion'}
          </button>
        </div>
        {/* Error */}

      </RecordDialog> : null}

      {/* Subregions Table */}
      <TableGroupProvider groupKeys={sortedSubregions.map((subregion) => String(subregion.region_id))}>
      <section className="rounded-xl border bg-card shadow-sm">


        <div data-product-toolbar="" data-section-header="" data-aligned-toolbar="" data-action-toolbar="" className="flex flex-wrap items-center justify-end gap-2 border-b px-4 py-3"><TableSearch value={search} onChange={setSearch} label="Search subregions" />
{authorization.can('Subregions', 'add') && <button type="button" data-action-tone="primary" data-action-fill="" onClick={() => { clearForm(); setFormOpen(true) }} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium"><AddRecordIcon className="size-4" aria-hidden="true" />Add Subregion</button>}
<TableGroupToggle disabled={initialLoading} /></div>

        <div className="overflow-x-auto">
          <Table data-directory-table="subregions" summary={summaryForLevel(sortedSubregions.length, 'regions', sortedSubregions.map((row) => row.region_id))} className="min-w-[640px] table-fixed wrap-anywhere">
            <colgroup>
              {(authorization.can('Subregions', 'add') || authorization.can('Subregions', 'edit') || authorization.can('Subregions', 'delete')) && <col data-action-column="standard" className="w-[20%]" />}
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col />
            <col style={{ width: 200 }} /></colgroup>
            <TableHeader>
              <TableRow>
                {(authorization.can('Subregions', 'add') || authorization.can('Subregions', 'edit') || authorization.can('Subregions', 'delete')) && <TableHead data-action-column="standard" className="px-3">Action</TableHead>}
                <TableHead data-fixed-column="status" className="px-3">Status</TableHead>
                <SortableHeader className="px-3" {...sortHeader('code')}>Code</SortableHeader>

                <SortableHeader className="px-3" {...sortHeader('name')}>Subregion Name</SortableHeader>


              <SortableHeader className="w-[200px] px-3" {...sortHeader('created_at')}>Date Created</SortableHeader></TableRow>
            </TableHeader>

            <TableBody>
              {initialLoading ? (
                <TableLoadingRow columns={authorization.can('Subregions', 'add') || authorization.can('Subregions', 'edit') || authorization.can('Subregions', 'delete') ? 5 : 4} label="subregions" />
              ) : sortedSubregions.length > 0 ? (
                <GroupedTableRows rows={sortedSubregions}
                  columnCount={authorization.can('Subregions', 'add') || authorization.can('Subregions', 'edit') || authorization.can('Subregions', 'delete') ? 5 : 4}
                  getGroup={(subregion) => ({ key: String(subregion.region_id), label: 'Region: ' + (regions.find((region) => region.id === subregion.region_id)?.name || 'Unknown region') })}>
                {(subregion) => {

                  return (
                    <TableRow key={subregion.id}>
                    {(authorization.can('Subregions', 'add') || authorization.can('Subregions', 'edit') || authorization.can('Subregions', 'delete')) && <TableCell data-action-column="standard" className="px-3">
                        {authorization.can('Subregions', 'edit') || authorization.can('Subregions', 'delete') ? <div className="flex flex-nowrap justify-start gap-1.5">
                          {authorization.can('Subregions', 'edit') && <TableActionButton action="edit" data-action-tone="caution"
                            className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
                            onClick={() => editSubregion(subregion)}
                            disabled={loading || !authorization.can('Subregions', 'edit')}
                           />}
                          {authorization.can('Subregions', 'delete') && <TableActionButton action="delete" data-action-tone="danger"
                            className="rounded-md border border-destructive/30 px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                            onClick={() => deleteSubregion(subregion.id)}
                            disabled={loading || !authorization.can('Subregions', 'delete')}
                           />}
                        </div> : <span className="text-sm text-muted-foreground">No Action</span>}
                    </TableCell>}
                    <TableCell className="px-3">
                      <StatusBadge status={subregion.is_active ? 'Active' : 'Inactive'} />
                    </TableCell>
                      <TableCell className="px-3 font-medium">
                        {subregion.code || '—'}
                      </TableCell>

                      <TableCell className="px-3">{subregion.name}</TableCell>


                    <TableCell className="px-3 whitespace-nowrap">{formatCreatedDate(subregion.created_at)}</TableCell></TableRow>
                  )
                }}</GroupedTableRows>
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={authorization.can('Subregions', 'add') || authorization.can('Subregions', 'edit') || authorization.can('Subregions', 'delete') ? 5 : 4}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {search.trim() ? 'No subregions match your search.' : 'No subregions to display.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
      </TableGroupProvider>
    </main>
  )
}
