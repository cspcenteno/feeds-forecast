'use client'

import { TableSearch, useTableSearch } from '@/components/ui/table-search'

import { usePopupError } from '@/components/action-dialogs'

import { StatusBadge } from '@/components/ui/status-badge'

import { Tags as HeadingTags } from 'lucide-react'

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

type Category = {
  created_at: string | null
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
  const [formOpen, setFormOpen] = useState(false)

  const [, setError] = usePopupError()
  const [loading, setLoading] = useState(false)
  const [tableLoading, setTableLoading] = useState(true)

  async function getCategories() {
    setTableLoading(true)
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('categories')
        .select('id, code, name, description, is_active, created_at')
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
    setFormOpen(true)
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
    setFormOpen(false)
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

  const { search, setSearch, filteredRows } = useTableSearch(categories, (row) => [row.code, row.name, row.description, row.is_active ? 'Active' : 'Inactive'])

  const { sortedRows: sortedCategories, sortHeader } = useTableSort(filteredRows, {
    created_at: (row) => row.created_at,
    code: (row) => row.code,
    name: (row) => row.name,
    description: (row) => row.description,
  })

  return (
    <main className="space-y-4">


      {/* Form */}
      {authorization.can('Categories', 'add') || editingId !== null ? <RecordDialog open={formOpen} onClose={clearForm} title={editingId === null ? 'Add Category' : 'Edit Category'} busy={loading}>
        <div className="mb-5">
          <h2 data-section-title="" className="font-semibold"><HeadingTags className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />
            {editingId !== null
              ? 'Edit Category'
              : 'Add Category'}
          </h2>


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
              placeholder="Enter category code"
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
              placeholder="Enter category name"
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
              placeholder="Enter description"
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
        <div data-action-toolbar="" className="mt-5 flex gap-2">
          <button data-action-tone="primary" data-action-fill=""
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={saveCategory}
            disabled={loading || !authorization.can('Categories', editingId === null ? 'add' : 'edit')}
          ><ActionSaveIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />
            {loading
              ? 'Saving...'
              : editingId !== null
                ? 'Save Changes'
                : 'Add Category'}
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


        <div data-section-header="" data-aligned-toolbar="" data-action-toolbar="" className="flex flex-wrap items-center justify-end gap-2 border-b px-4 py-3"><TableSearch value={search} onChange={setSearch} label="Search categories" />
{authorization.can('Categories', 'add') && <button type="button" data-action-tone="primary" data-action-fill="" onClick={() => { clearForm(); setFormOpen(true) }} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium"><AddRecordIcon className="size-4" aria-hidden="true" />Add Category</button>}
</div>

        <div className="overflow-x-auto">
          <Table summary={{ records: sortedCategories.length }} className="w-full min-w-[1120px] table-fixed" aria-busy={tableLoading}
            containerProps={{ className: 'overflow-auto', tabIndex: 0, role: 'region', 'aria-label': 'Categories table' }}>
            <colgroup>
              {(authorization.can('Categories', 'add') || authorization.can('Categories', 'edit') || authorization.can('Categories', 'delete')) && <col data-action-column="standard" />}
              <col style={{ width: 112 }} />
              <col style={{ width: 128 }} />
              <col style={{ width: '24%' }} />
              <col />
              <col style={{ width: 224 }} />
            </colgroup>
            <TableHeader>
              <TableRow>
                {(authorization.can('Categories', 'add') || authorization.can('Categories', 'edit') || authorization.can('Categories', 'delete')) && <TableHead data-action-column="standard" className="text-left">Action</TableHead>}
                <TableHead data-fixed-column="status" className="px-3">Status</TableHead>
                <SortableHeader className="pl-6" {...sortHeader('code')}>Code</SortableHeader>

                <SortableHeader className="px-3" {...sortHeader('name')}>Name</SortableHeader>

                <SortableHeader {...sortHeader('description')}>Description</SortableHeader>

              <SortableHeader className="px-3" {...sortHeader('created_at')}>Date Created</SortableHeader></TableRow>
            </TableHeader>

            <TableBody>
              {tableLoading ? (
                <TableLoadingRow columns={authorization.can('Categories', 'add') || authorization.can('Categories', 'edit') || authorization.can('Categories', 'delete') ? 6 : 5} label="categories" />
              ) : sortedCategories.length > 0 ? (
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
                      <StatusBadge status={category.is_active ? 'Active' : 'Inactive'} />
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

                  <TableCell className="px-3 whitespace-nowrap">{formatCreatedDate(category.created_at)}</TableCell></TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={authorization.can('Categories', 'add') || authorization.can('Categories', 'edit') || authorization.can('Categories', 'delete') ? 6 : 5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {search.trim() ? 'No categories match your search.' : 'No categories to display.'}
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
