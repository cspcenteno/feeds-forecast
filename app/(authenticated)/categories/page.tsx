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

type Category = {
  id: number
  code: string
  name: string
  description: string | null
  is_active: boolean
}

export default function CategoriesPage() {
  const authorization = useAuthorization()
  const [categories, setCategories] = useState<Category[]>([])

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)

  const [editingId, setEditingId] = useState<number | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function getCategories() {
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
  }

  async function saveCategory() {
    if (!authorization.can('Categories', editingId === null ? 'add' : 'edit')) return
    setError(null)

    if (!code.trim() || !name.trim()) {
      setError('Code and Name are required.')
      return
    }

    setLoading(true)

    const supabase = createClient()

    if (editingId !== null) {
      const { data, error } = await supabase
        .from('categories')
        .update({
          code: code.trim(),
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
          code: code.trim(),
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
    setEditingId(category.id)
    setCode(category.code)
    setName(category.name)
    setDescription(category.description ?? '')
    setIsActive(category.is_active)
    setError(null)
  }

  async function deleteCategory(id: number) {
    if (!authorization.can('Categories', 'delete')) return
    const confirmed = window.confirm(
      'Are you sure you want to delete this category?'
    )

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

  return (
    <main className="space-y-8">
      {/* Form */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
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

        <div className="grid gap-4 md:grid-cols-4">
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
              placeholder="e.g. BR"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>

          {/* Name */}
          <div className="space-y-2">
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
          <div className="space-y-2">
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
            Saved Categories
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            List of categories currently available in the system.
          </p>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6 w-[150px]">
                  Code
                </TableHead>

                <TableHead className="w-[250px]">
                  Name
                </TableHead>

                <TableHead>
                  Description
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
              {categories.length > 0 ? (
                categories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="pl-6 font-medium">
  {category.code}
</TableCell>

                    <TableCell>
                      {category.name}
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {category.description || '—'}
                    </TableCell>

                    <TableCell>
                      {category.is_active
                        ? 'Active'
                        : 'Inactive'}
                    </TableCell>

                    <TableCell>
                      <div className="flex justify-start gap-2">
                        <button
                          className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
                          onClick={() =>
                            editCategory(category)
                          }
                        >
                          Edit
                        </button>

                        <button
                          className="rounded-md border border-destructive/30 px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                          onClick={() =>
                            deleteCategory(category.id)
                          }
                          disabled={!authorization.can('Categories', 'delete')}
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
                    colSpan={5}
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
