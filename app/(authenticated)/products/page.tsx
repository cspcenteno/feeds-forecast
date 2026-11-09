'use client'

import { summaryForLevel } from '@/lib/table-summary-level'

import { usePopupError } from '@/components/action-dialogs'

import { StatusBadge } from '@/components/ui/status-badge'

import { Package as HeadingPackage } from 'lucide-react'

import { RecordDialog } from '@/components/ui/record-dialog'
import { Plus as AddRecordIcon } from 'lucide-react'
import { Save as ActionSaveIcon, X as ActionXIcon } from 'lucide-react'
import { ActiveField } from '@/components/ui/active-field'

import { useActionDialogs } from '@/components/action-dialogs'
import { SelectionField } from '@/components/ui/selection-field'
import { TableActionButton } from '@/components/ui/table-action-button'
import { TableLoadingRow } from '@/components/ui/loading-spinner'
import { GroupedTableRows, TableGroupProvider, TableGroupToggle } from '@/components/ui/grouped-table-rows'
import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
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
  is_active: boolean
}

type Product = {
  id: number
  category_id: number | null
  code: string
  name: string
  product_line: string | null
  species: string | null
  weight: number
  created_at: string | null
  is_active: boolean
}

const sortableColumns = [
  { key: 'category_id', label: 'Category', className: 'w-[14%]' },
  { key: 'code', label: 'Product Code', className: 'w-[12%]' },
  { key: 'name', label: 'Product Name', className: 'w-[18%]' },
  { key: 'product_line', label: 'Product Line', className: 'w-[12%]' },
  { key: 'species', label: 'Species', className: 'w-[10%]' },
  { key: 'created_at', label: 'Date Created', className: 'w-[13%]' },
] as const

type SortKey = (typeof sortableColumns)[number]['key']

export default function ProductsPage() {
  const { confirmAction } = useActionDialogs()

  const authorization = useAuthorization()
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean } | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  const [categoryId, setCategoryId] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [productLine, setProductLine] = useState('')
  const [species, setSpecies] = useState('')
  const [weight, setWeight] = useState('')
  const [isActive, setIsActive] = useState(true)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const [, setError] = usePopupError()
  const [loading, setLoading] = useState(false)
  const [tableLoading, setTableLoading] = useState(true)

  async function getProducts() {
    setTableLoading(true)
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('products')
        .select('id, category_id, code, name, product_line, species, weight, is_active, created_at')
        .order('id')

      if (error) {
        setError(error.message)
        return
      }

      setProducts(data ?? [])

    } finally {
      setTableLoading(false)
    }
  }

  async function getCategories() {
    const supabase = createClient()

    const { data, error } = await supabase
      .from('categories')
      .select('id, code, name, is_active')
      .order('name')

    if (error) {
      setError(error.message)
      return
    }

    setCategories(data ?? [])
  }

  async function saveProduct() {
    if (!authorization.can('Products', editingId === null ? 'add' : 'edit')) return
    setError(null)

    if (!categoryId || !code.trim() || !name.trim()) {
      setError('Category, Code, and Name are required.')
      return
    }

    const productWeight = Number(weight)

    if (weight.trim() !== '' && isNaN(productWeight)) {
      setError('Weight must be a valid number.')
      return
    }

    setLoading(true)

    const supabase = createClient()

    const productData = {
      category_id: Number(categoryId),
      code: code.trim(),
      name: name.trim(),
      product_line: productLine.trim() || null,
      species: species.trim() || null,
      weight: productWeight || 0,
      is_active: isActive,
    }

    if (editingId !== null) {
      const { data, error } = await supabase
        .from('products')
        .update(productData)
        .eq('id', editingId)
        .select()

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      if (!data || data.length === 0) {
        setError(
          'No product was updated. Check your RLS UPDATE policy.'
        )
        setLoading(false)
        return
      }
    } else {
      const { data, error } = await supabase
        .from('products')
        .insert(productData)
        .select()

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      if (!data || data.length === 0) {
        setError('Product was not added.')
        setLoading(false)
        return
      }
    }

    await getProducts()

    clearForm()
    setLoading(false)
  }

  function editProduct(product: Product) {
    if (!authorization.can('Products', 'edit')) return
    setEditingId(product.id)
    setFormOpen(true)
    setCategoryId(product.category_id?.toString() ?? '')
    setCode(product.code)
    setName(product.name)
    setProductLine(product.product_line ?? '')
    setSpecies(product.species ?? '')
    setWeight(product.weight?.toString() ?? '')
    setIsActive(product.is_active)
    setError(null)
  }

  async function deleteProduct(id: number) {
    let actionConfirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
    if (!authorization.can('Products', 'delete')) return
    const confirmed = (actionConfirmation = await confirmAction({ message: 'Are you sure you want to delete this product?', details: [{ label: 'Product', value: products.find((item) => item.id === id)?.name || '#' + id }] }))

    if (!confirmed) {
      return
    }

    setError(null)
    setLoading(true)

    const supabase = createClient()

    const { error } = await supabase
      .from('products')
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

    await getProducts()

    setLoading(false)

    } finally { actionConfirmation?.finish() }
  }

  function clearForm() {
    setFormOpen(false)
    setEditingId(null)
    setCategoryId('')
    setCode('')
    setName('')
    setProductLine('')
    setSpecies('')
    setWeight('')
    setIsActive(true)
    setError(null)
  }

  useEffect(() => {
    getProducts()
    getCategories()
  }, [])

  const canShowActions = authorization.can('Products', 'add') ||
    authorization.can('Products', 'edit') || authorization.can('Products', 'delete')
  const columnCount = canShowActions ? 9 : 8
  const categoryLabels = new Map(categories.map((category) => [
    category.id,
    category.code ? category.code + ' - ' + category.name : category.name,
  ]))
  function categoryLabel(id: Product['category_id']) {
    return id === null ? 'Uncategorized' : categoryLabels.get(id) ?? 'Category #' + id
  }

  function sortValue(product: Product, key: SortKey) {
    if (key === 'category_id') return categoryLabel(product.category_id)
    if (key === 'created_at') return product.created_at ? new Date(product.created_at).toISOString() : ''
    return product[key] ?? ''
  }

  const sortedProducts = sort ? [...products].sort((a, b) => {
    const first = sortValue(a, sort.key)
    const second = sortValue(b, sort.key)
    const comparison = first.localeCompare(second, undefined, { numeric: true, sensitivity: 'base' })
    return (sort.descending ? -comparison : comparison) || a.id - b.id
  }) : products

  return (
    <main className="space-y-4">


      {/* Form */}
      {authorization.can('Products', 'add') || editingId !== null ? <RecordDialog open={formOpen} onClose={clearForm} title={editingId === null ? 'Add Product' : 'Edit Product'} busy={loading}>
        <div className="mb-5">
          <h2 data-section-title="" className="font-semibold"><HeadingPackage className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />
            {editingId !== null
              ? 'Edit Product'
              : 'Add Product'}
          </h2>


        </div>

        <div className="app-field-row">
          {/* Category */}
          <div className="space-y-2">
            <label
              htmlFor="category"
              className="text-sm font-medium"
            >
              Category
            </label>

            <SelectionField id="category"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
                  value={categoryId}
                  onValueChange={(selectionValue) => setCategoryId(selectionValue)}
                  aria-label="Category">
              <option value="">Select category</option>

              {categories.filter((category) => category.is_active || (editingId !== null && String(category.id) === categoryId)).map((category) => (
                <option
                  key={category.id}
                  value={category.id}
                >
                  {category.code ? category.code + ' - ' : ''}{category.name}
                </option>
              ))}
            </SelectionField>
          </div>

          {/* Product Code */}
          <div data-field-size="compact" className="space-y-2">
            <label
              htmlFor="code"
              className="text-sm font-medium"
            >
              Product Code
            </label>

            <input
              id="code"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm uppercase outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              placeholder="Enter product code"
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
              Product Name
            </label>

            <input
              id="name"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              placeholder="Enter product name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="productLine" className="text-sm font-medium">Product Line</label>
            <input
              id="productLine"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
              value={productLine}
              onChange={(e) => setProductLine(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="species" className="text-sm font-medium">Species</label>
            <input
              id="species"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
            />
          </div>

          <div data-field-size="compact" className="space-y-2">
            <label htmlFor="weight" className="text-sm font-medium">Weight</label>
            <input
              id="weight"
              type="number" step="any" min="0" placeholder="Enter weight (kg)"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
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
            onClick={saveProduct}
            disabled={loading || !authorization.can('Products', editingId === null ? 'add' : 'edit')}
          ><ActionSaveIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />
            {loading
              ? 'Saving...'
              : editingId !== null
                ? 'Save Changes'
                : 'Add Product'}
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
      <TableGroupProvider groupKeys={sortedProducts.map((product) => String(product.category_id))}>
      <section className="rounded-xl border bg-card shadow-sm">
        <div data-section-header="" data-action-toolbar="" className="flex flex-wrap items-center justify-end gap-2 border-b px-4 py-3">{authorization.can('Products', 'add') && <button type="button" data-action-tone="primary" data-action-fill="" onClick={() => { clearForm(); setFormOpen(true) }} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium"><AddRecordIcon className="size-4" aria-hidden="true" />Add Product</button>}<TableGroupToggle disabled={tableLoading} /></div>

        <div className="overflow-x-auto">
          <Table summary={summaryForLevel(sortedProducts.length, 'categories', sortedProducts.map((row) => row.category_id))} saved aria-busy={tableLoading} className="table-fixed">
            <TableHeader>
              <TableRow>
                {canShowActions && <TableHead data-action-column="standard" className="w-[13%] text-left">Action</TableHead>}
                <TableHead data-fixed-column="status" className="w-[8%]">Status</TableHead>
                {sortableColumns.map(({ key, label, className }) => {
                  const active = sort?.key === key
                  const SortIcon = active ? (sort.descending ? ChevronDown : ChevronUp) : ChevronsUpDown
                  return (
                    <Fragment key={key}>
                    {key === 'created_at' && <TableHead className="w-[8%] text-right">Weight</TableHead>}
                    <TableHead key={key} className={className} aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : undefined}>
                      <button
                        type="button"
                        className="inline-flex cursor-pointer items-center gap-1 rounded-sm focus-visible:outline-2"
                        onClick={() => setSort((current) => ({ key, descending: current?.key === key && !current.descending }))}
                      >
                        {label}
                        <SortIcon aria-hidden="true" className={active ? 'size-4 shrink-0' : 'size-4 shrink-0 text-muted-foreground'} />
                      </button>
                    </TableHead>
                    </Fragment>
                  )
                })}
              </TableRow>
            </TableHeader>

            <TableBody>
              {tableLoading ? (
                <TableLoadingRow columns={columnCount} label="products" />
              ) : sortedProducts.length > 0 ? <GroupedTableRows rows={sortedProducts} columnCount={columnCount}
                getGroup={(product) => ({ key: String(product.category_id), label: 'Category: ' + categoryLabel(product.category_id) })}>
                {(product) => (
                <TableRow key={product.id}>
                  {canShowActions && (
                    <TableCell data-action-column="standard">
                      {authorization.can('Products', 'edit') || authorization.can('Products', 'delete') ? (
                        <div className="flex flex-nowrap justify-start gap-2">
                          {authorization.can('Products', 'edit') && (
                            <TableActionButton action="edit" data-action-tone="caution"
                              className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
                              onClick={() => editProduct(product)}
                             />
                          )}
                          {authorization.can('Products', 'delete') && (
                            <TableActionButton action="delete" data-action-tone="danger"
                              className="rounded-md border border-destructive/30 px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                              onClick={() => deleteProduct(product.id)}
                             />
                          )}
                        </div>
                      ) : <span className="text-sm text-muted-foreground">No Action</span>}
                    </TableCell>
                  )}
                  <TableCell><StatusBadge status={product.is_active ? 'Active' : 'Inactive'} /></TableCell>
                  <TableCell>{categoryLabel(product.category_id)}</TableCell>
                  <TableCell className="font-medium">{product.code}</TableCell>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>{product.product_line || '—'}</TableCell>
                  <TableCell>{product.species || '—'}</TableCell>
                  <TableCell className="text-right">{Number(product.weight).toLocaleString('en-PH')}</TableCell>
                  <TableCell>{product.created_at ? new Date(product.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</TableCell>
                </TableRow>
              )}</GroupedTableRows> : (
                <TableRow>
                  <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
                    No products to display.
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
