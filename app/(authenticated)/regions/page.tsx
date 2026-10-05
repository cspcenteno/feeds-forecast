'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/client'

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
  is_active: boolean
}

export default function RegionsPage() {
  const [regions, setRegions] = useState<Region[]>([])

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [isActive, setIsActive] = useState(true)

  const [editingId, setEditingId] = useState<number | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function getRegions() {
    const supabase = createClient()

    const { data, error } = await supabase
      .from('regions')
      .select('id, name, code, is_active')
      .order('id')

    if (error) {
      setError(error.message)
      return
    }

    setRegions(data ?? [])
  }

  async function saveRegion() {
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
    setEditingId(region.id)
    setName(region.name)
    setCode(region.code ?? '')
    setIsActive(region.is_active)
    setError(null)
  }

  async function deleteRegion(id: number) {
    const confirmed = window.confirm(
      'Are you sure you want to delete this region?'
    )

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
  }

  function clearForm() {
    setEditingId(null)
    setName('')
    setCode('')
    setIsActive(true)
    setError(null)
  }

  useEffect(() => {
    getRegions()
  }, [])

  return (
    <main className="space-y-8">
      {/* Form */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="font-semibold">
            {editingId !== null
              ? 'Edit Region'
              : 'Add Region'}
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            {editingId !== null
              ? 'Update the selected region.'
              : 'Create a new region.'}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
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
              placeholder="e.g. Luzon"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Code */}
          <div className="space-y-2">
            <label
              htmlFor="code"
              className="text-sm font-medium"
            >
              Code
            </label>

            <input
              id="code"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm uppercase outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              placeholder="e.g. LUZ"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>

          {/* Active */}
          <div className="flex items-end">
            <label className="flex h-10 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) =>
                  setIsActive(e.target.checked)
                }
                className="size-4"
              />

              <span className="font-medium">
                Active
              </span>
            </label>
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-5 flex gap-2">
          <button
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={saveRegion}
            disabled={loading}
          >
            {loading
              ? 'Saving...'
              : editingId !== null
                ? 'Update Region'
                : 'Add Region'}
          </button>

          {editingId !== null && (
            <button
              className="inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
              onClick={clearForm}
              disabled={loading}
            >
              Cancel
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </section>

      {/* Table */}
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-5">
          <h2 className="font-semibold">
            Saved Regions
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            List of regions currently available in the system.
          </p>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6 w-[150px]">
  Code
</TableHead>

                <TableHead>
                  Region Name
                </TableHead>

                <TableHead className="w-[120px]">
                  Status
                </TableHead>

                <TableHead className="w-[180px] text-left">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {regions.length > 0 ? (
                regions.map((region) => (
                  <TableRow key={region.id}>
                    <TableCell className="pl-6 font-medium">
                      {region.code || '—'}
                    </TableCell>

                    <TableCell>
                      {region.name}
                    </TableCell>

                    <TableCell>
                      {region.is_active
                        ? 'Active'
                        : 'Inactive'}
                    </TableCell>

                    <TableCell>
                      <div className="flex justify-start gap-2">
                        <button
                          className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
                          onClick={() =>
                            editRegion(region)
                          }
                        >
                          Edit
                        </button>

                        <button
                          className="rounded-md border border-destructive/30 px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                          onClick={() =>
                            deleteRegion(region.id)
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No regions found.
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