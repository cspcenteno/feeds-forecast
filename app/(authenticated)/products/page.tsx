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

type Category = {
  id: number
  code: string
  name: string
}

type Product = {
  id: number
  category_id: number | null
  code: string
  name: string
  unit_price: number
  is_active: boolean
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  const [categoryId, setCategoryId] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [isActive, setIsActive] = useState(true)

  const [editingId, setEditingId] = useState<number | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function getProducts() {
    const supabase = createClient()

    const { data, error } = await supabase
      .from('products')
      .select('id, category_id, code, name, unit_price, is_active')
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
      .select('id, code, name')
      .eq('is_active', true)
      .order('name')

    if (error) {
      setError(error.message)
      return
    }

    setCategories(data ?? [])
  }

  async function saveProduct() {
    setError(null)

    if (!categoryId || !code.trim() || !name.trim()) {
      setError('Category, Code, and Name are required.')
      return
    }

    const price = Number(unitPrice)

    if (unitPrice.trim() !== '' && isNaN(price)) {
      setError('Unit Price must be a valid number.')
      return
    }

    setLoading(true)

    const supabase = createClient()

    const productData = {
      category_id: Number(categoryId),
      code: code.trim(),
      name: name.trim(),
      unit_price: price || 0,
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
    setEditingId(product.id)
    setCategoryId(product.category_id?.toString() ?? '')
    setCode(product.code)
    setName(product.name)
    setUnitPrice(product.unit_price?.toString() ?? '')
    setIsActive(product.is_active)
    setError(null)
  }

  async function deleteProduct(id: number) {
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
    setUnitPrice('')
    setIsActive(true)
    setError(null)
  }

  useEffect(() => {
    getProducts()
    getCategories()
  }, [])

  return (
    <main className="space-y-8">
      {/* Form */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
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

        <div className="grid gap-4 md:grid-cols-5">
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

              {categories.map((category) => (
                <option
                  key={category.id}
                  value={category.id}
                >
                  {category.code} - {category.name}
                </option>
              ))}
            </select>
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

          {/* Unit Price */}
          <div className="space-y-2">
            <label
              htmlFor="unitPrice"
              className="text-sm font-medium"
            >
              Unit Price
            </label>

            <input
              id="unitPrice"
              type="number"
              step="0.01"
              min="0"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              placeholder="0.00"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
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
            onClick={saveProduct}
            disabled={loading}
          >
            {loading
              ? 'Saving...'
              : editingId !== null
                ? 'Update Product'
                : 'Add Product'}
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
            Saved Products
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            List of products currently available in the system.
          </p>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px] pl-6">
                  Code
                </TableHead>

                <TableHead className="w-[220px]">
                  Product Name
                </TableHead>

                <TableHead className="w-[180px]">
                  Category
                </TableHead>

                <TableHead className="w-[150px]">
                  Unit Price
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
              {products.length > 0 ? (
                products.map((product) => {
                  const category = categories.find(
                    (item) => item.id === product.category_id
                  )

                  return (
                    <TableRow key={product.id}>
                      <TableCell className="pl-6 font-medium">
                        {product.code}
                      </TableCell>

                      <TableCell>
                        {product.name}
                      </TableCell>

                      <TableCell>
                        {category
                          ? `${category.code} - ${category.name}`
                          : '—'}
                      </TableCell>

                      <TableCell>
                        {Number(product.unit_price).toLocaleString(
                          'en-PH',
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }
                        )}
                      </TableCell>

                      <TableCell>
                        {product.is_active
                          ? 'Active'
                          : 'Inactive'}
                      </TableCell>

                      <TableCell>
                        <div className="flex justify-start gap-2">
                          <button
                            className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
                            onClick={() =>
                              editProduct(product)
                            }
                          >
                            Edit
                          </button>

                          <button
                            className="rounded-md border border-destructive/30 px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                            onClick={() =>
                              deleteProduct(product.id)
                            }
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
                    colSpan={6}
                    className="h-24 text-center text-muted-foreground"
                  >
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