
'use client'

import { useEffect, useState } from 'react'
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
  const authorization = useAuthorization()
  const [subregions, setSubregions] = useState<Subregion[]>([])
  const [regions, setRegions] = useState<Region[]>([])

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [regionId, setRegionId] = useState('')
  const [isActive, setIsActive] = useState(true)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
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

    setRegions(regionsResult.data ?? [])
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
    setName(subregion.name)
    setCode(subregion.code ?? '')
    setRegionId(String(subregion.region_id))
    setIsActive(subregion.is_active ?? true)
    setError(null)
  }

  async function deleteSubregion(id: number) {
    if (!authorization.can('Subregions', 'delete')) return
    const confirmed = window.confirm(
      'Are you sure you want to delete this subregion?'
    )

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
  }

  function clearForm() {
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

  return (
    <main className="space-y-8">
      {/* Subregion Form */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="font-semibold">
            {editingId !== null
              ? 'Edit Subregion'
              : 'Add Subregion'}
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            {editingId !== null
              ? 'Update the selected subregion.'
              : 'Create a subregion and assign it to a region.'}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
              placeholder="e.g. Central Luzon"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Code */}
          <div className="space-y-2">
            <label
              htmlFor="subregion-code"
              className="text-sm font-medium"
            >
              Code
            </label>

            <input
              id="subregion-code"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm uppercase outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              placeholder="e.g. CL"
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

            <select
              id="parent-region"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
              disabled={loading}
            >
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
            </select>
          </div>

          {/* Active */}
          <div className="flex items-end">
            <label className="flex h-10 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="size-4"
                disabled={loading}
              />

              <span className="font-medium">Active</span>
            </label>
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-5 flex gap-2">
          <button
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={saveSubregion}
            disabled={loading || initialLoading || !authorization.can('Subregions', editingId === null ? 'add' : 'edit')}
          >
            {loading
              ? 'Saving...'
              : editingId !== null
                ? 'Update Subregion'
                : 'Add Subregion'}
          </button>

          {editingId !== null && (
            <button
              className="inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              onClick={clearForm}
              disabled={loading}
            >
              Cancel
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}
      </section>

      {/* Subregions Table */}
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-5">
          <h2 className="font-semibold">Saved Subregions</h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Manage subregions and their parent regions.
          </p>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px] pl-6">
                  Code
                </TableHead>

                <TableHead>Subregion Name</TableHead>

                <TableHead>Parent Region</TableHead>

                <TableHead className="w-[120px]">
                  Status
                </TableHead>

                <TableHead className="w-[180px]">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {initialLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Loading subregions...
                  </TableCell>
                </TableRow>
              ) : subregions.length > 0 ? (
                subregions.map((subregion) => {
                  const parentRegion = regions.find(
                    (region) => region.id === subregion.region_id
                  )

                  return (
                    <TableRow key={subregion.id}>
                      <TableCell className="pl-6 font-medium">
                        {subregion.code || '—'}
                      </TableCell>

                      <TableCell>{subregion.name}</TableCell>

                      <TableCell>
                        {parentRegion?.name ?? 'Unknown region'}
                      </TableCell>

                      <TableCell>
                        {subregion.is_active
                          ? 'Active'
                          : 'Inactive'}
                      </TableCell>

                      <TableCell>
                        <div className="flex justify-start gap-2">
                          <button
                            className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
                            onClick={() => editSubregion(subregion)}
                            disabled={loading || !authorization.can('Subregions', 'edit')}
                          >
                            Edit
                          </button>

                          <button
                            className="rounded-md border border-destructive/30 px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                            onClick={() =>
                              deleteSubregion(subregion.id)
                            }
                            disabled={loading || !authorization.can('Subregions', 'delete')}
                          >
                            Delete
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No subregions found.
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
