'use client'

import { useEffect, useState } from 'react'
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
  { key: 'created_at', label: 'Date created', className: 'w-[13%]' },
] as const

type SortKey = (typeof sortableColumns)[number]['key']

export default function ProductsPage() {
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

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function getProducts() {
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
    if (!authorization.can('Products', 'delete')) return
    const confirmed = window.confirm(
      'Are you sure you want to delete this product?'
    )

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
  }

  function clearForm() {
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
    <main className="space-y-8">
      {/* Form */}
      {authorization.can('Products', 'add') || editingId !== null ? <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="font-semibold">
            {editingId !== null
              ? 'Edit Product'
              : 'Add Product'}
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            {editingId !== null
              ? 'Update the selected product.'
              : 'Create a new product.'}
          </p>
        </div>

        <div className="grid items-end gap-4 md:grid-cols-4">
          {/* Category */}
          <div className="space-y-2">
            <label
              htmlFor="category"
              className="text-sm font-medium"
            >
              Category
            </label>

            <select
              id="category"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Select category</option>

              {categories.filter((category) => category.is_active || (editingId !== null && String(category.id) === categoryId)).map((category) => (
                <option
                  key={category.id}
                  value={category.id}
                >
                  {category.code ? category.code + ' - ' : ''}{category.name}
                </option>
              ))}
            </select>
          </div>

          {/* Product Code */}
          <div className="space-y-2">
            <label
              htmlFor="code"
              className="text-sm font-medium"
            >
              Product Code
            </label>

            <input
              id="code"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm uppercase outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              placeholder="e.g. BS-001"
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
              Product Name
            </label>

            <input
              id="name"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              placeholder="e.g. Broiler Starter"
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

          <div className="space-y-2">
            <label htmlFor="weight" className="text-sm font-medium">Weight</label>
            <input
              id="weight"
              type="number" step="any" min="0" placeholder="Enter weight"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
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
          <button data-action-tone="primary" data-action-fill=""
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={saveProduct}
            disabled={loading || !authorization.can('Products', editingId === null ? 'add' : 'edit')}
          >
            {loading
              ? 'Saving...'
              : editingId !== null
                ? 'Update Product'
                : 'Add Product'}
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
            Saved Products
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            List of products currently available in the system.
          </p>
        </div>

        <div className="overflow-x-auto">
          <Table saved className="table-fixed">
            <TableHeader>
              <TableRow>
                {canShowActions && <TableHead className="w-[13%] text-left">Action</TableHead>}
                <TableHead className="w-[8%]">Status</TableHead>
                {sortableColumns.map(({ key, label, className }) => {
                  const active = sort?.key === key
                  const SortIcon = active ? (sort.descending ? ChevronDown : ChevronUp) : ChevronsUpDown
                  return (
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
                  )
                })}
                <TableHead className="w-[8%]">Weight</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {sortedProducts.length > 0 ? sortedProducts.map((product) => (
                <TableRow key={product.id}>
                  {canShowActions && (
                    <TableCell>
                      {authorization.can('Products', 'edit') || authorization.can('Products', 'delete') ? (
                        <div className="flex flex-wrap justify-start gap-2">
                          {authorization.can('Products', 'edit') && (
                            <button data-action-tone="caution"
                              className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
                              onClick={() => editProduct(product)}
                            >Edit</button>
                          )}
                          {authorization.can('Products', 'delete') && (
                            <button data-action-tone="danger"
                              className="rounded-md border border-destructive/30 px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                              onClick={() => deleteProduct(product.id)}
                            >Delete</button>
                          )}
                        </div>
                      ) : <span className="text-sm text-muted-foreground">No Action</span>}
                    </TableCell>
                  )}
                  <TableCell>{product.is_active ? 'Active' : 'Inactive'}</TableCell>
                  <TableCell>{categoryLabel(product.category_id)}</TableCell>
                  <TableCell className="font-medium">{product.code}</TableCell>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>{product.product_line || '—'}</TableCell>
                  <TableCell>{product.species || '—'}</TableCell>
                  <TableCell>{product.created_at ? new Date(product.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</TableCell>
                  <TableCell>{Number(product.weight).toLocaleString('en-PH')}</TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
                    No products found.
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
