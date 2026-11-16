import { disabledPermissions, type ModuleName } from '@/lib/authorization-rules'

type PermissionRow = { module: ModuleName; can_view: boolean; can_add: boolean; can_edit: boolean; can_import?: boolean; can_export?: boolean; can_delete: boolean }
const actions = ['view', 'add', 'edit', 'import', 'export', 'delete'] as const

export function permissionDefaultPreview(current: PermissionRow[], defaults: PermissionRow[]) {
  return defaults.flatMap((next) => {
    const before = current.find((row) => row.module === next.module)
    const enabled: string[] = []
    const disabled: string[] = []
    for (const action of actions) {
      if (disabledPermissions[next.module]?.includes(action)) continue
      const field = `can_${action}` as const
      if (Boolean(before?.[field]) === Boolean(next[field])) continue
      const label = action[0].toUpperCase() + action.slice(1)
      if (next[field]) enabled.push(label)
      else disabled.push(label)
    }
    const value = [enabled.length ? `Enable: ${enabled.join(', ')}` : '', disabled.length ? `Disable: ${disabled.join(', ')}` : ''].filter(Boolean).join('; ')
    return value ? [{ label: next.module, value }] : []
  })
}
