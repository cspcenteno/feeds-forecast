
export const modules = [
  'Dashboard',
  'Forecasts',
  'Weekly Sales',
  'Approvals',
  'Budgets',
  'Actuals',
  'Categories',
  'Products',
  'Customers',
  'Regions',
  'Subregions',
  'Users',
  'Week Locks',
  'Audit Logs',
] as const

export type ModuleName = (typeof modules)[number]
export type Action = 'view' | 'add' | 'edit' | 'import' | 'export' | 'delete'
export type PermissionMap = Record<ModuleName, Record<Action, boolean>>

export const importModules: readonly ModuleName[] = ['Forecasts', 'Actuals', 'Budgets', 'Users']

export const disabledPermissions: Partial<Record<ModuleName, Action[]>> = {
  'Audit Logs': ['add', 'edit', 'delete'],
  Dashboard: ['add', 'edit', 'delete'],
  'Weekly Sales': ['add', 'edit', 'delete'],
  Approvals: ['add', 'delete'],
  'Week Locks': ['add', 'delete'],
}

for (const moduleName of modules) {
  if (!importModules.includes(moduleName)) {
    disabledPermissions[moduleName] = [...(disabledPermissions[moduleName] ?? []), 'import']
  }
  if (moduleName !== 'Weekly Sales') {
    disabledPermissions[moduleName] = [...(disabledPermissions[moduleName] ?? []), 'export']
  }
}

export function emptyPermissions(): PermissionMap {
  return Object.fromEntries(
    modules.map((module) => [
      module,
      { view: false, add: false, edit: false, import: false, export: false, delete: false },
    ]),
  ) as PermissionMap
}

export function savedPermissions(rows: readonly {
  module: string
  can_view: boolean | null
  can_add: boolean | null
  can_edit: boolean | null
  can_delete: boolean | null
  can_import?: boolean | null
  can_export?: boolean | null
}[]): PermissionMap {
  const permissions = emptyPermissions()
  for (const row of rows) {
    if (!modules.includes(row.module as ModuleName)) continue
    const moduleName = row.module as ModuleName
    permissions[moduleName] = {
      view: row.can_view === true,
      add: row.can_add === true,
      edit: row.can_edit === true,
      delete: row.can_delete === true,
      import: row.can_view === true && row.can_import === true,
      export: row.can_view === true && row.can_export === true,
    }
    for (const action of disabledPermissions[moduleName] ?? []) permissions[moduleName][action] = false
  }
  return permissions
}

export function defaultPermissions(role: string, position = ''): PermissionMap {
  const p = emptyPermissions()
  const salesPosition = position.trim().toUpperCase()

  const set = (module: ModuleName, actions: Action[]) => {
    actions.forEach((action) => {
      p[module][action] = true
    })
  }

  if (role === 'User') {
    set('Dashboard', ['view'])
    set('Forecasts', ['view', 'add', 'edit', 'delete'])
    set('Weekly Sales', ['view'])
  } else if (role === 'Superuser') {
    ;(
      [
        'Dashboard',
        'Weekly Sales',
        'Products',
      ] as ModuleName[]
    ).forEach((m) => set(m, ['view']))

    set('Customers', ['view', 'add', 'edit'])
    set('Budgets', ['view', 'add', 'edit'])
    set('Actuals', ['view', 'add', 'edit', 'import'])
  } else if (role === 'Manager' && salesPosition === 'NSM') {
    set('Dashboard', ['view'])
    set('Weekly Sales', ['view'])
  } else if (role === 'Manager') {
    ;(
      [
        'Dashboard',
        'Weekly Sales',
        'Approvals',
        'Budgets',
        'Actuals',
      ] as ModuleName[]
    ).forEach((m) => set(m, ['view']))

    set('Approvals', ['view', 'edit'])
    if (salesPosition === 'RSM') set('Forecasts', ['view', 'edit'])
  } else if (role === 'Admin') {
    modules.forEach((m) => set(m, ['view', 'add', 'edit', 'import', 'delete']))
  }

  p['Weekly Sales'].export = p['Weekly Sales'].view && (['User', 'Superuser', 'Admin'].includes(role)
    || (role === 'Manager' && ['', 'RSM', 'ASM', 'NSM'].includes(salesPosition)))
  for (const moduleName of modules) {
    for (const action of disabledPermissions[moduleName] ?? []) {
      p[moduleName][action] = false
    }
  }

  return p
}
