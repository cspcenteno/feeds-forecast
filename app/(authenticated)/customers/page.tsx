'use client'

import { TableSearch, useTableSearch } from '@/components/ui/table-search'

import { summaryForLevel } from '@/lib/table-summary-level'

import { usePopupError } from '@/components/action-dialogs'

import { sortRegions } from '@/lib/region-order'

import { StatusBadge } from '@/components/ui/status-badge'

import { Users as HeadingUsers } from 'lucide-react'

import { RecordDialog } from '@/components/ui/record-dialog'
import { SalespersonInput } from '@/components/ui/salesperson-input'
import { Plus as AddRecordIcon } from 'lucide-react'
import { UserPlus as ActionUserPlusIcon, X as ActionXIcon } from 'lucide-react'
import { ActiveField } from '@/components/ui/active-field'

import { useActionDialogs } from '@/components/action-dialogs'
import { SelectionField } from '@/components/ui/selection-field'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { TableActionButton } from '@/components/ui/table-action-button'
import { TableLoadingRow } from '@/components/ui/loading-spinner'
import { GroupedTableRows, TableGroupProvider, TableGroupToggle } from '@/components/ui/grouped-table-rows'
import { Table } from '@/components/ui/table'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { SortableHeader, useTableSort } from '@/components/ui/sortable-header'
import { createClient } from '@/lib/client'
import { useAuthorization } from '@/lib/authorization'

type Customer = {
  id: number
  customer: string
  salesman: string | null
  region_id: string | number | null
  is_active: boolean
  segment: string | null
  created_at: string | null
}

type Region = {
  id: string | number
  name: string
}

export default function CustomersPage() {
  const { confirmAction } = useActionDialogs()

  const supabase = useMemo(() => createClient(), [])
  const authorization = useAuthorization()
  const allRegions = authorization.role === 'Admin' || authorization.position?.trim().toUpperCase() === 'NSM'
  const assignedRegionId = authorization.regionId
  const [regionFilter, setRegionFilter] = useState('all')
  const effectiveRegion = allRegions ? regionFilter : String(assignedRegionId ?? '')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [customer, setCustomer] = useState('')
  const [salesman, setSalesman] = useState('')
  const [regionId, setRegionId] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [segment, setSegment] = useState('')
  const [loading, setLoading] = useState(false)
  const [tableLoading, setTableLoading] = useState(true)
  const [, setError] = usePopupError()

  const loadCustomers = useCallback(async () => {
    if (authorization.loading) return
    setTableLoading(true)
    try {
      if (!authorization.can('Customers', 'view')) {
        setCustomers([])
        setRegions([])
        return
      }
      const customerQuery = supabase.from('customers')
        .select('id, customer, salesman, region_id, is_active, segment, created_at').order('customer')
      const regionQuery = supabase.from('regions').select('id, name').eq('is_active', true).order('name')
      if (!allRegions) {
        if (assignedRegionId === null) {
          setCustomers([])
          setRegions([])
          return
        }
        customerQuery.eq('region_id', assignedRegionId)
        regionQuery.eq('id', assignedRegionId)
      }
      const [customersResult, regionsResult] = await Promise.all([
        customerQuery,
        regionQuery,
      ])

      if (customersResult.error || regionsResult.error) {
        setError(customersResult.error?.message ?? regionsResult.error?.message ?? 'Unable to load customer data.')
        return
      }

      setCustomers((customersResult.data ?? []) as Customer[])
      setRegions(sortRegions((regionsResult.data ?? []) as Region[]))

    } finally {
      setTableLoading(false)
    }
  }, [supabase, authorization, allRegions, assignedRegionId])

  useEffect(() => {
    void Promise.resolve().then(loadCustomers)
  }, [loadCustomers])

  function resetForm() {
    setFormOpen(false)
    setEditingId(null)
    setCustomer('')
    setSalesman('')
    setRegionId(allRegions ? (regionFilter === 'all' ? '' : regionFilter) : String(assignedRegionId ?? ''))
    setIsActive(true)
    setSegment('')
    setError('')
  }

  function startEdit(item: Customer) {
    if (!authorization.can('Customers', 'edit')) return
    setEditingId(item.id)
    setFormOpen(true)
    setCustomer(item.customer)
    setSalesman(item.salesman ?? '')
    setRegionId(item.region_id == null ? '' : String(item.region_id))
    setIsActive(item.is_active)
    setSegment(item.segment ?? '')
    setError('')
  }

  async function saveCustomer() {
    const action = editingId === null ? 'add' : 'edit'
    if (!authorization.can('Customers', action)) return
    if (!customer.trim()) {
      setError('Customer name is required.')
      return
    }
    if (!allRegions && (assignedRegionId === null || regionId !== String(assignedRegionId))) {
      setError('Customers must belong to your assigned region.')
      return
    }

    setLoading(true)
    setError('')
    const values = {
      customer: customer.trim(),
      salesman: salesman.trim() || null,
      region_id: regionId ? Number(regionId) : null,
      is_active: isActive,
      segment: segment.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const query = editingId === null
      ? supabase.from('customers').insert(values)
      : supabase.from('customers').update(values).eq('id', editingId)
    const { data: saved, error: saveError } = await query.select('id').maybeSingle()

    if (saveError || !saved) {
      setError(saveError?.message ?? 'The customer could not be saved with your current permissions.')
      setLoading(false)
      return
    }

    await loadCustomers()
    resetForm()
    setLoading(false)
  }

  async function deleteCustomer(id: number) {
    let actionConfirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
    if (!authorization.can('Customers', 'delete')) return
    if (!(actionConfirmation = await confirmAction({ message: 'Delete this customer?', details: [{ label: 'Customer', value: customers.find((item) => item.id === id)?.customer || '#' + id }] }))) return

    setLoading(true)
    setError('')
    const { data: deleted, error: deleteError } = await supabase
      .from('customers')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (deleteError || !deleted) {
      setError(deleteError?.message ?? 'The customer could not be deleted with your current permissions.')
      setLoading(false)
      return
    }

    if (editingId === id) resetForm()
    await loadCustomers()
    setLoading(false)

    } finally { actionConfirmation?.finish() }
  }

  const regionalCustomers = customers.filter((row) => effectiveRegion === 'all' || (effectiveRegion !== '' && String(row.region_id) === effectiveRegion))
  const { search, setSearch, filteredRows } = useTableSearch(regionalCustomers, (row) => [row.customer, row.salesman, row.segment, regions.find((region) => String(region.id) === String(row.region_id))?.name, row.is_active ? 'Active' : 'Inactive'])

  const { sortedRows: sortedCustomers, sortHeader } = useTableSort(filteredRows, {
    customer: (row) => row.customer,
    salesman: (row) => row.salesman,
    region: (row) => regions.find((region) => String(region.id) === String(row.region_id))?.name ?? null,
    segment: (row) => row.segment,
    status: (row) => row.is_active ? 'Active' : 'Inactive',
    created_at: (row) => row.created_at ? new Date(row.created_at).toISOString() : null,
  })

  return (
    <main className="space-y-4">


      {authorization.can('Customers', 'add') || editingId !== null ? (
        <RecordDialog open={formOpen} onClose={resetForm} title={editingId === null ? 'Add Customer' : 'Edit Customer'} busy={loading}>
          <div className="mb-5" data-popup-form-header="">
            <h2 data-section-title="" className="font-semibold"><HeadingUsers className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />{editingId === null ? 'Add Customer' : 'Edit Customer'}</h2>

          </div>

          <div className="overflow-x-auto pb-1">
          <div data-customer-fields="" className="app-field-row">
            <label data-field-size="wide" className="space-y-2 text-sm font-medium">
              <span className="text-destructive">*</span> Customer Name
              <input placeholder="Enter name" value={customer} onChange={(e) => setCustomer(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm font-normal" />
            </label>
            <label data-field-size="wide" className="space-y-2 text-sm font-medium">
              Salesman
              <SalespersonInput value={salesman} onValueChange={setSalesman} placeholder="Select or enter salesman name" />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Region
              <SelectionField value={regionId}
                  disabled={!allRegions}
                  onValueChange={(selectionValue) => setRegionId(selectionValue)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm font-normal"
                  aria-label="Region">
                <option value="">Select region</option>
                {regions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </SelectionField>
            </label>
            <label className="space-y-2 text-sm font-medium">
              Segment
              <SearchableSelect aria-label="Segment" freeText value={segment} onValueChange={setSegment}
                options={[{ value: 'DISTRIBUTOR', label: 'DISTRIBUTOR' }, { value: 'FARM', label: 'FARM' }]} placeholder="Select or enter segment" />
            </label>
            <div data-field-size="toggle" className="flex items-end">
              <ActiveField checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            </div>
          </div>

          </div>



          <div data-action-toolbar="" className="mt-5 flex gap-2" data-dialog-footer="">
            {authorization.can('Customers', editingId === null ? 'add' : 'edit') && (
              <button data-action-tone="primary" data-action-fill="" onClick={() => void saveCustomer()} disabled={loading} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"><ActionUserPlusIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />
                <span>{loading ? 'Saving...' : editingId === null ? 'Add Customer' : 'Save Changes'}</span>
              </button>
            )}
            <button data-action-tone="neutral" onClick={resetForm} disabled={loading} className="h-10 rounded-md border px-4 text-sm"><ActionXIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" /><span>Cancel</span></button>
          </div>
        </RecordDialog>
      ) : null}

      <TableGroupProvider groupKeys={sortedCustomers.map((item) => item.salesman?.trim() || '')}>
      <section className="rounded-xl border bg-card shadow-sm">


        <div data-customer-toolbar="" data-filter-toolbar="" className="flex flex-nowrap items-end justify-between gap-4 overflow-x-auto border-b px-6 py-4">
          <div className="w-40 shrink-0">
            <div className="app-field-row">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-muted-foreground" htmlFor="customers-region-filter">Region</label>
          <SelectionField aria-label="Filter customers by region" value={effectiveRegion}
            loading={tableLoading || authorization.loading} loadingText="Loading regions…"
            id="customers-region-filter"
            onValueChange={setRegionFilter} disabled={!allRegions || tableLoading}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:bg-muted">
            {allRegions ? <option value="all">All Regions</option> : null}
            {!allRegions && assignedRegionId === null ? <option value="">No assigned region</option> : null}
            {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
          </SelectionField>
              </div>
            </div>
          </div>
          <div data-action-toolbar="" data-master-search-actions="" className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 whitespace-nowrap">
            <TableSearch value={search} onChange={setSearch} label="Search customers" placeholder="Search here…" />
            <div data-customer-buttons="" className="contents">
{authorization.can('Customers', 'add') && <button type="button" aria-label="Add Customer" title="Add Customer" data-action-tone="primary" data-action-fill="" onClick={() => { resetForm(); setFormOpen(true) }} disabled={loading} className="inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium"><AddRecordIcon className="size-4" aria-hidden="true" /><span className="hidden md:inline">Add Customer</span></button>}



            </div>
          </div>
        </div>
        <Table data-directory-table="customers" summary={summaryForLevel(sortedCustomers.length, 'salespeople', sortedCustomers.map((row) => row.salesman?.trim()))} aria-busy={tableLoading}
          className="min-w-[1200px] table-fixed wrap-anywhere"
          containerProps={{ className: "max-h-[min(32rem,65vh)] overflow-auto", tabIndex: 0, role: "region", "aria-label": "Saved Customers table" }}
        >
            <colgroup>
              {(authorization.can('Customers', 'add') || authorization.can('Customers', 'edit') || authorization.can('Customers', 'delete')) && <col data-action-column="standard" />}
              <col data-directory-column="customer" />
              <col data-directory-column="salesperson" />
              <col data-directory-column="region" className="w-32" />
              <col data-directory-column="segment" className="w-32" />
              <col data-fixed-column="status" />
              <col data-directory-column="created" className="w-[180px]" />
            </colgroup>
            <thead><tr className="border-b bg-muted/40">
              {(authorization.can('Customers', 'add') || authorization.can('Customers', 'edit') || authorization.can('Customers', 'delete')) && <th data-action-column="standard" className="px-1.5 py-3 sm:px-3 text-left font-medium">Action</th>}
              <SortableHeader plain className="px-1.5 py-3 sm:px-3 text-left font-medium" leadingAction={<TableGroupToggle header disabled={tableLoading} />} {...sortHeader('customer')}>Customer Name</SortableHeader>
              <SortableHeader plain className="px-1.5 py-3 sm:px-3 text-left font-medium" {...sortHeader('salesman')}>Salesman</SortableHeader>
              <SortableHeader plain className="px-1.5 py-3 sm:px-3 text-left font-medium" {...sortHeader('region')}>Region</SortableHeader>
              <SortableHeader plain className="px-1.5 py-3 sm:px-3 text-left font-medium" {...sortHeader('segment')}>Segment</SortableHeader>
              <SortableHeader plain className="px-1.5 py-3 sm:px-3 text-left font-medium" {...sortHeader('status')}>Status</SortableHeader>
              <SortableHeader plain className="px-1.5 py-3 sm:px-3 text-left font-medium" {...sortHeader('created_at')}>Date Created</SortableHeader>
            </tr></thead>
            <tbody>
              {tableLoading ? (
                <TableLoadingRow columns={authorization.can('Customers', 'add') || authorization.can('Customers', 'edit') || authorization.can('Customers', 'delete') ? 7 : 6} label="customers" />
              ) : sortedCustomers.length === 0 ? (
                <tr><td colSpan={authorization.can('Customers', 'add') || authorization.can('Customers', 'edit') || authorization.can('Customers', 'delete') ? 7 : 6} className="px-6 py-10 text-center text-muted-foreground">{search.trim() ? 'No customers match your search.' : 'No customers to display.'}</td></tr>
              ) : <GroupedTableRows rows={sortedCustomers}
                columnCount={authorization.can('Customers', 'add') || authorization.can('Customers', 'edit') || authorization.can('Customers', 'delete') ? 7 : 6}
                getGroup={(item) => ({ key: item.salesman?.trim() || '', label: 'Salesman: ' + (item.salesman?.trim() || 'Unassigned') })}>
                {(item) => (
                <tr key={item.id} className="border-b last:border-0">
                  {(authorization.can('Customers', 'add') || authorization.can('Customers', 'edit') || authorization.can('Customers', 'delete')) && <td data-action-column="standard" className="px-1.5 py-3 sm:px-3">
                    {authorization.can('Customers', 'edit') || authorization.can('Customers', 'delete') ? (
                      <div className="flex flex-nowrap gap-1">
                        {authorization.can('Customers', 'edit') && <TableActionButton action="edit" data-action-tone="caution" onClick={() => startEdit(item)} className="rounded-md border px-1 py-1.5 sm:px-2" />}
                        {authorization.can('Customers', 'delete') && <TableActionButton action="delete" data-action-tone="danger" onClick={() => void deleteCustomer(item.id)} disabled={loading} className="rounded-md border border-destructive/30 px-1 py-1.5 sm:px-2 text-destructive" />}
                      </div>
                    ) : <span className="text-muted-foreground">No Action</span>}
                  </td>}
                  <td className="px-1.5 py-3 sm:px-3 font-medium wrap-anywhere">{item.customer}</td>
                  <td className="px-1.5 py-3 sm:px-3">{item.salesman || '—'}</td>
                  <td className="px-1.5 py-3 sm:px-3">{regions.find((region) => String(region.id) === String(item.region_id))?.name || '—'}</td>
                  <td className="px-1.5 py-3 sm:px-3">{item.segment || '—'}</td>
                  <td className="px-1.5 py-3 sm:px-3"><StatusBadge status={item.is_active ? 'Active' : 'Inactive'} /></td>
                  <td className="px-1.5 py-3 sm:px-3">{item.created_at ? new Date(item.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                </tr>
              )}</GroupedTableRows>}
            </tbody>
        </Table>

      </section>
      </TableGroupProvider>
    </main>
  )
}
