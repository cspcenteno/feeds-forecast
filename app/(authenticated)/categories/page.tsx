'use client'

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

type Category = {
  id: number
  code: string | null
  name: string
  description: string | null
  is_active: boolean
}

export default function CategoriesPage() {
  const { confirmAction } = useActionDialogs()

  const authorization = useAuthorization()
  const [categories, setCategories] = useState<Category[]>([])

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)

  const [editingId, setEditingId] = useState<number | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tableLoading, setTableLoading] = useState(true)

  async function getCategories() {
    setTableLoading(true)
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('categories')
        .select('id, code, name, description, is_active')
        .order('id')

      if (error) {
        setError(error.message)
        return
      }

      setCategories(data ?? [])

    } finally {
      setTableLoading(false)
    }
  }

  async function saveCategory() {
    if (!authorization.can('Categories', editingId === null ? 'add' : 'edit')) return
    setError(null)

    if (!name.trim()) {
      setError('Name is required.')
      return
    }

    setLoading(true)

    const supabase = createClient()

    if (editingId !== null) {
      const { data, error } = await supabase
        .from('categories')
        .update({
          code: code.trim() || null,
          name: name.trim(),
          description: description.trim() || null,
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
          'No category was updated. Check your RLS UPDATE policy.'
        )
        setLoading(false)
        return
      }
    } else {
      const { data, error } = await supabase
        .from('categories')
        .insert({
          code: code.trim() || null,
          name: name.trim(),
          description: description.trim() || null,
          is_active: isActive,
        })
        .select()

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      if (!data || data.length === 0) {
        setError('Category was not added.')
        setLoading(false)
        return
      }
    }

    // Refresh table from Supabase
    await getCategories()

    clearForm()
    setLoading(false)
  }

  function editCategory(category: Category) {
    if (!authorization.can('Categories', 'edit')) return
    setEditingId(category.id)
    setCode(category.code ?? '')
    setName(category.name)
    setDescription(category.description ?? '')
    setIsActive(category.is_active)
    setError(null)
  }

  async function deleteCategory(id: number) {
    let actionConfirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
    if (!authorization.can('Categories', 'delete')) return
    const confirmed = (actionConfirmation = await confirmAction({ message: 'Are you sure you want to delete this category?', details: [{ label: 'Category', value: categories.find((item) => item.id === id)?.name || '#' + id }] }))

    if (!confirmed) {
      return
    }

    setError(null)
    setLoading(true)

    const supabase = createClient()

    const { error } = await supabase
      .from('categories')
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
    await getCategories()

    setLoading(false)

    } finally { actionConfirmation?.finish() }
  }

  function clearForm() {
    setEditingId(null)
    setCode('')
    setName('')
    setDescription('')
    setIsActive(true)
    setError(null)
  }

  useEffect(() => {
    getCategories()
  }, [])

  const { sortedRows: sortedCategories, sortHeader } = useTableSort(categories, {
    code: (row) => row.code,
    name: (row) => row.name,
    description: (row) => row.description,
  })

  return (
    <main className="space-y-8">
      {/* Form */}
      {authorization.can('Categories', 'add') || editingId !== null ? <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="font-semibold">
            {editingId !== null
              ? 'Edit Category'
              : 'Add Category'}
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            {editingId !== null
              ? 'Update the selected category.'
              : 'Create a new product category.'}
          </p>
        </div>

        <div className="app-field-row">
          {/* Code */}
          <div data-field-size="compact" className="space-y-2">
            <label
              htmlFor="code"
              className="text-sm font-medium"
            >
              Code <span className="text-muted-foreground">(Optional)</span>
            </label>

            <input
              id="code"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm uppercase outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              placeholder="e.g. BR"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>

          {/* Name */}
          <div data-field-size="wide" className="space-y-2">
            <label
              htmlFor="name"
              className="text-sm font-medium"
            >
              Name
            </label>

            <input
              id="name"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              placeholder="e.g. Broiler"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div data-field-size="wide" className="space-y-2">
            <label
              htmlFor="description"
              className="text-sm font-medium"
            >
              Description
            </label>

            <input
              id="description"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              placeholder="Category description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
        <div className="mt-5 flex gap-2">
          <button data-action-tone="primary" data-action-fill=""
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={saveCategory}
            disabled={loading || !authorization.can('Categories', editingId === null ? 'add' : 'edit')}
          >
            {loading
              ? 'Saving...'
              : editingId !== null
                ? 'Update Category'
                : 'Add Category'}
          </button>

          {editingId !== null && (
            <button data-action-tone="neutral"
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
      </section> : null}

      {/* Table */}
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-5">
          <h2 className="font-semibold">
            Saved Categories
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            List of categories currently available in the system.
          </p>
        </div>

        <div className="overflow-x-auto">
          <Table saved aria-busy={tableLoading}>
            <TableHeader>
              <TableRow>
                {(authorization.can('Categories', 'add') || authorization.can('Categories', 'edit') || authorization.can('Categories', 'delete')) && <TableHead data-action-column="standard" className="w-[180px] text-left">Action</TableHead>}
                <TableHead data-fixed-column="status" className="w-[120px]">Status</TableHead>
                <SortableHeader className="pl-6 w-[150px]" {...sortHeader('code')}>Code</SortableHeader>

                <SortableHeader className="w-[250px]" {...sortHeader('name')}>Name</SortableHeader>

                <SortableHeader {...sortHeader('description')}>Description</SortableHeader>

              </TableRow>
            </TableHeader>

            <TableBody>
              {tableLoading ? (
                <TableLoadingRow columns={authorization.can('Categories', 'add') || authorization.can('Categories', 'edit') || authorization.can('Categories', 'delete') ? 5 : 4} label="categories" />
              ) : categories.length > 0 ? (
                sortedCategories.map((category) => (
                  <TableRow key={category.id}>
                    {(authorization.can('Categories', 'add') || authorization.can('Categories', 'edit') || authorization.can('Categories', 'delete')) && <TableCell data-action-column="standard">
                      {authorization.can('Categories', 'edit') || authorization.can('Categories', 'delete') ? <div className="flex justify-start gap-2">
                        {authorization.can('Categories', 'edit') && <TableActionButton action="edit" data-action-tone="caution"
                          className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
                          onClick={() => editCategory(category)}
                          disabled={!authorization.can('Categories', 'edit')}
                         />}
                        {authorization.can('Categories', 'delete') && <TableActionButton action="delete" data-action-tone="danger"
                          className="rounded-md border border-destructive/30 px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                          onClick={() => deleteCategory(category.id)}
                          disabled={!authorization.can('Categories', 'delete')}
                         />}
                      </div> : <span className="text-sm text-muted-foreground">No Action</span>}
                    </TableCell>}
                    <TableCell>
                      {category.is_active ? 'Active' : 'Inactive'}
                    </TableCell>
                    <TableCell className="pl-6 font-medium">
                      {category.code || '—'}
</TableCell>

                    <TableCell>
                      {category.name}
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {category.description || '—'}
                    </TableCell>

                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={authorization.can('Categories', 'add') || authorization.can('Categories', 'edit') || authorization.can('Categories', 'delete') ? 5 : 4}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No categories found.
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
