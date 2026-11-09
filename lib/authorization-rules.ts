
export const modules = [
  'Dashboard',
  'Forecast Input',
  'Weekly Sales',
  'Approvals',
  'Budget',
  'Actual',
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
export type Action = 'view' | 'add' | 'edit' | 'delete'
export type PermissionMap = Record<ModuleName, Record<Action, boolean>>

export const disabledPermissions: Partial<Record<ModuleName, Action[]>> = {
  'Audit Logs': ['add', 'edit', 'delete'],
  Dashboard: ['add', 'edit', 'delete'],
  'Weekly Sales': ['add', 'edit', 'delete'],
  Approvals: ['add', 'delete'],
}

export function emptyPermissions(): PermissionMap {
  return Object.fromEntries(
    modules.map((module) => [
      module,
      { view: false, add: false, edit: false, delete: false },
    ]),
  ) as PermissionMap
}

export function defaultPermissions(role: string): PermissionMap {
  const p = emptyPermissions()

  const set = (module: ModuleName, actions: Action[]) => {
    actions.forEach((action) => {
      p[module][action] = true
    })
  }

  if (role === 'User') {
    set('Dashboard', ['view'])
    set('Forecast Input', ['view', 'add', 'edit'])
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
    set('Budget', ['view', 'add', 'edit'])
    set('Actual', ['view', 'add', 'edit'])
    set('Week Locks', ['view', 'add', 'edit'])
  } else if (role === 'Manager') {
    ;(
      [
        'Dashboard',
        'Weekly Sales',
        'Approvals',
        'Budget',
        'Actual',
      ] as ModuleName[]
    ).forEach((m) => set(m, ['view']))

    set('Approvals', ['view', 'edit'])
  } else if (role === 'Admin') {
    modules.forEach((m) => set(m, ['view', 'add', 'edit', 'delete']))
  }

  for (const moduleName of modules) {
    for (const action of disabledPermissions[moduleName] ?? []) {
      p[moduleName][action] = false
    }
  }

  return p
}
