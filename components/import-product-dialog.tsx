'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/client'
import { useAuthorization } from '@/lib/authorization'
import { RecordDialog } from '@/components/ui/record-dialog'
import { SelectionField } from '@/components/ui/selection-field'

export type ImportedProduct = { id: number; category_id: number | null; code: string; name: string; weight: number | null }

export function ImportProductDialog({ code: initialCode, name: initialName, onClose, onAdded }: {
  code: string
  name: string
  onClose: () => void
  onAdded: (product: ImportedProduct) => void
}) {
  const client = useMemo(() => createClient(), [])
  const authorization = useAuthorization()
  const [code, setCode] = useState(initialCode)
  const [name, setName] = useState(initialName)
  const [category, setCategory] = useState('')
  const [weight, setWeight] = useState('')
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const items: { id: number; name: string }[] = []
        for (let offset = 0; ; offset += 500) {
          const result = await client.from('categories').select('id, name').eq('is_active', true).order('id').range(offset, offset + 499).abortSignal(AbortSignal.timeout(45000))
          if (result.error) throw result.error
          items.push(...(result.data ?? []))
          if ((result.data?.length ?? 0) < 500) break
        }
        if (!cancelled) setCategories(items)
      } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load categories. Close and retry.') }
      finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [client])
  return <RecordDialog open onClose={onClose} title="Add to Products" busy={saving}>
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault()
      if (saving || loading || !authorization.can('Products', 'add')) return
      setError('')
      const numericWeight = Number(weight)
      if (!code.trim() || !name.trim() || !categories.some((item) => String(item.id) === category) || !weight.trim() || !Number.isFinite(numericWeight) || numericWeight < 0) {
        setError('Enter a code, product name, active category, and a non-negative weight.')
        return
      }
      setSaving(true)
      try {
        const { data, error } = await client.from('products').insert({ code: code.trim(), name: name.trim(), category_id: Number(category), weight: numericWeight, is_active: true }).select('id, category_id, code, name, weight').single()
        if (error) throw error
        onAdded(data)
      } catch (err) { setError(err instanceof Error ? err.message : 'Unable to add product. Check whether the code already exists.') }
      finally { setSaving(false) }
    }}>
      <h3 className="pr-8 text-base font-semibold">Add to Products</h3>
      <div className="app-field-row">
        <label className="space-y-1 text-sm">Product code<input required value={code} onChange={(event) => setCode(event.target.value)} className="h-10 w-full rounded-md border px-3" /></label>
        <label className="space-y-1 text-sm">Product name<input required value={name} onChange={(event) => setName(event.target.value)} className="h-10 w-full rounded-md border px-3" /></label>
        <label className="space-y-1 text-sm">Category<SelectionField aria-label="Category" value={category} onValueChange={setCategory} disabled={loading} required placeholder={loading ? 'Loading categories…' : 'Select category…'}><option value="">Select category</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectionField></label>
        <label className="space-y-1 text-sm">Weight (kg)<input required type="number" min="0" step="any" value={weight} onChange={(event) => setWeight(event.target.value)} className="h-10 w-full rounded-md border px-3" /></label>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2"><button type="submit" disabled={loading || saving || !authorization.can('Products', 'add')} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">{saving ? 'Saving…' : 'Add Product'}</button><button type="button" onClick={onClose} disabled={saving} className="rounded-md border px-3 py-2 text-sm">Cancel</button></div>
    </form>
  </RecordDialog>
}
