
'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/client'

import {
  emptyPermissions,
  modules,
  disabledPermissions,
  defaultPermissions,
} from '@/lib/authorization-rules'

import type {
  Action,
  ModuleName,
  PermissionMap,
} from '@/lib/authorization-rules'

export {
  modules,
  disabledPermissions,
  defaultPermissions,
} from '@/lib/authorization-rules'

export type {
  Action,
  ModuleName,
  PermissionMap,
} from '@/lib/authorization-rules'

type Authz = {
  loading: boolean
  role: string
  regionId: number | null
  subregionId: number | null
  permissions: PermissionMap
  can: (module: ModuleName, action: Action) => boolean
}

const Context = createContext<Authz>({
  loading: true,
  role: '',
  regionId: null,
  subregionId: null,
  permissions: emptyPermissions(),
  can: () => false,
})

export function AuthorizationProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = useMemo(() => createClient(), [])
  const pathname = usePathname()
  const router = useRouter()

  const [state, setState] = useState<Omit<Authz, 'can'>>({
    loading: true,
    role: '',
    regionId: null,
    subregionId: null,
    permissions: emptyPermissions(),
  })

  useEffect(() => {
    let live = true

    void (async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        if (live) router.replace('/login')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role, is_active, region_id, subregion_id')
        .eq('id', user.id)
        .maybeSingle()

      if (
        profileError ||
        !profile ||
        !profile.is_active
      ) {
        if (live) router.replace('/login')
        return
      }

      const role = profile.role ?? 'User'

      const { data: saved, error: permissionError } = await supabase
        .from('user_permissions')
        .select('module, can_view, can_add, can_edit, can_delete')
        .eq('user_id', user.id)

      if (!live) return

      let permissions = permissionError
        ? emptyPermissions()
        : defaultPermissions(role)

      if (!permissionError && saved?.length) {
        permissions = emptyPermissions()

        for (const row of saved) {
          if (!modules.includes(row.module as ModuleName)) continue

          const moduleName = row.module as ModuleName

          permissions[moduleName] = {
            view: !!row.can_view,
            add: !!row.can_add,
            edit: !!row.can_edit,
            delete: !!row.can_delete,
          }
        }

        // Enforce restricted actions for all roles.
        for (const moduleName of modules) {
          for (const action of disabledPermissions[moduleName] ?? []) {
            permissions[moduleName][action] = false
          }
        }
      }

      setState({
        loading: false,
        role,
        regionId:
          profile.region_id == null
            ? null
            : Number(profile.region_id),
        subregionId:
          profile.subregion_id == null
            ? null
            : Number(profile.subregion_id),
        permissions,
      })
    })()

    return () => {
      live = false
    }
  }, [pathname, router, supabase])

  const pathModule: Record<string, ModuleName> = {
    '/dashboard': 'Dashboard',
    '/sales-input': 'Sales Input',
    '/weekly-sales': 'Weekly Sales',
    '/approvals': 'Approvals',
    '/budget': 'Budget',
    '/categories': 'Categories',
    '/products': 'Products',
    '/regions': 'Regions',
    '/subregions': 'Subregions',
    '/users': 'Users',
    '/locks': 'Week Locks',
  }

  const currentModule = pathModule[pathname]

  useEffect(() => {
    if (
      !state.loading &&
      currentModule &&
      !state.permissions[currentModule].view
    ) {
      const firstAllowed = modules.find(
        (item) => state.permissions[item].view,
      )

      const paths: Record<ModuleName, string> = {
        Dashboard: '/dashboard',
        'Sales Input': '/sales-input',
        'Weekly Sales': '/weekly-sales',
        Approvals: '/approvals',
        Budget: '/budget',
        Categories: '/categories',
        Products: '/products',
        Regions: '/regions',
        Subregions: '/subregions',
        Users: '/users',
        'Week Locks': '/locks',
      }

      if (firstAllowed) {
        router.replace(paths[firstAllowed])
      }
    }
  }, [
    currentModule,
    router,
    state.loading,
    state.permissions,
  ])

  const value = useMemo<Authz>(
    () => ({
      ...state,
      can: (module, action) => state.permissions[module][action],
    }),
    [state],
  )

  if (state.loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Checking access…
      </div>
    )
  }

  if (
    currentModule &&
    !state.permissions[currentModule].view
  ) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have view permission for this module.
      </div>
    )
  }

  return (
    <Context.Provider value={value}>
      {children}
    </Context.Provider>
  )
}

export function useAuthorization() {
  return useContext(Context)
}
