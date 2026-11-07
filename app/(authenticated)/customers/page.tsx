'use client'

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
  const supabase = useMemo(() => createClient(), [])
  const authorization = useAuthorization()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [customer, setCustomer] = useState('')
  const [salesman, setSalesman] = useState('')
  const [regionId, setRegionId] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [segment, setSegment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadCustomers = useCallback(async () => {
    const [customersResult, regionsResult] = await Promise.all([
      supabase
        .from('customers')
        .select('id, customer, salesman, region_id, is_active, segment, created_at')
        .order('customer'),
      supabase.from('regions').select('id, name').eq('is_active', true).order('name'),
    ])

    if (customersResult.error || regionsResult.error) {
      setError(customersResult.error?.message ?? regionsResult.error?.message ?? 'Unable to load customer data.')
      return
    }

    setCustomers((customersResult.data ?? []) as Customer[])
    setRegions((regionsResult.data ?? []) as Region[])
  }, [supabase])

  useEffect(() => {
    void Promise.resolve().then(loadCustomers)
  }, [loadCustomers])

  function resetForm() {
    setEditingId(null)
    setCustomer('')
    setSalesman('')
    setRegionId('')
    setIsActive(true)
    setSegment('')
    setError('')
  }

  function startEdit(item: Customer) {
    if (!authorization.can('Customers', 'edit')) return
    setEditingId(item.id)
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
    if (!authorization.can('Customers', 'delete')) return
    if (!window.confirm('Delete this customer?')) return

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
  }

  const { sortedRows: sortedCustomers, sortHeader } = useTableSort(customers, {
    customer: (row) => row.customer,
    salesman: (row) => row.salesman,
    region: (row) => regions.find((region) => String(region.id) === String(row.region_id))?.name ?? null,
    segment: (row) => row.segment,
    created_at: (row) => row.created_at ? new Date(row.created_at).toISOString() : null,
  })

  return (
    <main className="space-y-8">
      {authorization.can('Customers', 'add') || editingId !== null ? (
        <section className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="font-semibold">{editingId === null ? 'Add Customer' : 'Edit Customer'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage customer details used by Forecast Input and Weekly Sales.
            </p>
          </div>

          <div className="overflow-x-auto pb-1">
          <div className="grid min-w-[760px] grid-cols-[minmax(180px,2fr)_minmax(150px,1.5fr)_minmax(140px,1fr)_minmax(140px,1fr)_auto] items-end gap-4">
            <label className="space-y-2 text-sm font-medium">
              Customer <span className="text-destructive">*</span>
              <input value={customer} onChange={(e) => setCustomer(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm font-normal" />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Salesman
              <input value={salesman} onChange={(e) => setSalesman(e.target.value)} placeholder="Enter salesman name" className="h-10 w-full rounded-md border bg-background px-3 text-sm font-normal" />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Region
              <select value={regionId} onChange={(e) => setRegionId(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm font-normal">
                <option value="">Select region</option>
                {regions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium">
              Segment
              <input value={segment} onChange={(e) => setSegment(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm font-normal" />
            </label>
            <div className="flex items-end">
              <label className="flex h-10 cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-4" />
                <span className="font-medium">Active</span>
              </label>
            </div>
          </div>

          </div>

          {error && <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

          <div className="mt-5 flex gap-2">
            {authorization.can('Customers', editingId === null ? 'add' : 'edit') && (
              <button data-action-tone="primary" data-action-fill="" onClick={() => void saveCustomer()} disabled={loading} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
                {loading ? 'Saving...' : editingId === null ? 'Add Customer' : 'Update Customer'}
              </button>
            )}
            {editingId !== null && <button data-action-tone="neutral" onClick={resetForm} disabled={loading} className="h-10 rounded-md border px-4 text-sm">Cancel</button>}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-5">
          <h2 className="font-semibold">Customers</h2>
          <p className="mt-1 text-sm text-muted-foreground">{customers.length} customer{customers.length === 1 ? '' : 's'}</p>
        </div>
        <Table
          className="table-fixed wrap-anywhere"
          containerProps={{ className: "max-h-[min(32rem,65vh)] overflow-x-hidden overflow-y-auto", tabIndex: 0, role: "region", "aria-label": "Saved Customers table" }}
        >
            <thead><tr className="border-b bg-muted/40">
              {(authorization.can('Customers', 'add') || authorization.can('Customers', 'edit') || authorization.can('Customers', 'delete')) && <th className="px-1.5 py-3 sm:px-3 text-left font-medium">Action</th>}
              <SortableHeader plain className="w-[24%] px-1.5 py-3 sm:px-3 text-left font-medium" {...sortHeader('customer')}>Customer</SortableHeader>
              <SortableHeader plain className="px-1.5 py-3 sm:px-3 text-left font-medium" {...sortHeader('salesman')}>Salesman</SortableHeader>
              <SortableHeader plain className="px-1.5 py-3 sm:px-3 text-left font-medium" {...sortHeader('region')}>Region</SortableHeader>
              <SortableHeader plain className="px-1.5 py-3 sm:px-3 text-left font-medium" {...sortHeader('segment')}>Segment</SortableHeader>
              <th className="px-1.5 py-3 sm:px-3 text-left font-medium">Status</th>
              <SortableHeader plain className="px-1.5 py-3 sm:px-3 text-left font-medium" {...sortHeader('created_at')}>Date created</SortableHeader>
            </tr></thead>
            <tbody>
              {customers.length === 0 ? (
                <tr><td colSpan={authorization.can('Customers', 'add') || authorization.can('Customers', 'edit') || authorization.can('Customers', 'delete') ? 7 : 6} className="px-6 py-10 text-center text-muted-foreground">No customers found.</td></tr>
              ) : sortedCustomers.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  {(authorization.can('Customers', 'add') || authorization.can('Customers', 'edit') || authorization.can('Customers', 'delete')) && <td className="px-1.5 py-3 sm:px-3">
                    {authorization.can('Customers', 'edit') || authorization.can('Customers', 'delete') ? (
                      <div className="flex flex-wrap gap-1">
                        {authorization.can('Customers', 'edit') && <button data-action-tone="caution" onClick={() => startEdit(item)} className="rounded-md border px-1 py-1.5 sm:px-2">Edit</button>}
                        {authorization.can('Customers', 'delete') && <button data-action-tone="danger" onClick={() => void deleteCustomer(item.id)} disabled={loading} className="rounded-md border border-destructive/30 px-1 py-1.5 sm:px-2 text-destructive">Delete</button>}
                      </div>
                    ) : <span className="text-muted-foreground">No Action</span>}
                  </td>}
                  <td className="px-1.5 py-3 sm:px-3 font-medium wrap-anywhere">{item.customer}</td>
                  <td className="px-1.5 py-3 sm:px-3">{item.salesman || '—'}</td>
                  <td className="px-1.5 py-3 sm:px-3">{regions.find((region) => String(region.id) === String(item.region_id))?.name || '—'}</td>
                  <td className="px-1.5 py-3 sm:px-3">{item.segment || '—'}</td>
                  <td className="px-1.5 py-3 sm:px-3">{item.is_active ? 'Active' : 'Inactive'}</td>
                  <td className="px-1.5 py-3 sm:px-3">{item.created_at ? new Date(item.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                </tr>
              ))}
            </tbody>
        </Table>
        {error && !authorization.can('Customers', 'add') && <p className="m-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      </section>
    </main>
  )
}
