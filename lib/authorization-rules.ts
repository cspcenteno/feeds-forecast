
export const modules = [
  'Dashboard',
  'Sales Input',
  'Weekly Sales',
  'Approvals',
  'Budget',
  'Categories',
  'Products',
  'Regions',
  'Subregions',
  'Users',
  'Week Locks',
] as const

export type ModuleName = (typeof modules)[number]
export type Action = 'view' | 'add' | 'edit' | 'delete'
export type PermissionMap = Record<ModuleName, Record<Action, boolean>>

export const disabledPermissions: Partial<Record<ModuleName, Action[]>> = {
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
    set('Sales Input', ['view', 'add', 'edit'])
    set('Weekly Sales', ['view'])
  } else if (role === 'Superuser') {
    ;(
      [
        'Dashboard',
        'Sales Input',
        'Weekly Sales',
        'Approvals',
        'Categories',
        'Products',
        'Regions',
        'Subregions',
      ] as ModuleName[]
    ).forEach((m) => set(m, ['view']))

    set('Budget', ['view', 'add', 'edit'])
    set('Week Locks', ['view', 'add', 'edit'])
  } else if (role === 'Manager') {
    ;(
      [
        'Dashboard',
        'Sales Input',
        'Weekly Sales',
        'Approvals',
        'Categories',
        'Products',
        'Regions',
        'Subregions',
        'Budget',
        'Week Locks',
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
