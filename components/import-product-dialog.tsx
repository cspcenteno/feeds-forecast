'use client'

import { usePopupError } from '@/components/action-dialogs'

import { useEffect, useMemo, useState } from 'react'
import { PackagePlus, X } from 'lucide-react'
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
  const [, setError] = usePopupError()
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
  }, [client, setError])
  return <RecordDialog open onClose={onClose} title="Add to Products" busy={saving} stackLevel={1}>
    <form data-import-product-form="" className="flex flex-col gap-4" onSubmit={async (event) => {
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
      <h3 data-dialog-title className="pr-8 text-lg font-semibold" data-popup-form-header="">Add to Products</h3>
      <div className="app-field-row gap-x-4 gap-y-4">
        <label className="space-y-1 text-sm">Product name <span className="text-destructive" aria-hidden="true">*</span><input required value={name} onChange={(event) => setName(event.target.value)} className="h-10 w-full rounded-md border px-3" /></label>
        <label className="space-y-1 text-sm">Product code <span className="text-destructive" aria-hidden="true">*</span><input required value={code} onChange={(event) => setCode(event.target.value)} className="h-10 w-full rounded-md border px-3" /></label>
        <label className="space-y-1 text-sm">Category <span className="text-destructive" aria-hidden="true">*</span><SelectionField aria-label="Category" value={category} onValueChange={setCategory} disabled={loading} required placeholder={loading ? 'Loading categories…' : 'Select category…'}>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectionField></label>
        <label className="space-y-1 text-sm">Weight (kg) <span className="text-destructive" aria-hidden="true">*</span><input required type="number" min="0" step="any" value={weight} onChange={(event) => setWeight(event.target.value)} className="h-10 w-full rounded-md border px-3" /></label>
      </div>

      <div data-action-toolbar="" data-dialog-footer="" className="flex flex-wrap justify-end gap-2 border-t pt-4"><button data-action-tone="neutral" type="button" onClick={onClose} disabled={saving} className="h-10 rounded-md border px-4 text-sm"><X className="size-4 shrink-0" aria-hidden="true" />Cancel</button><button data-action-tone="primary" data-action-fill="" type="submit" disabled={loading || saving || !authorization.can('Products', 'add')} className="h-10 rounded-md border px-4 text-sm font-medium disabled:opacity-50"><PackagePlus className="size-4 shrink-0" aria-hidden="true" />{saving ? 'Saving…' : 'Add Product'}</button></div>
    </form>
  </RecordDialog>
}
