
'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import { LoaderCircle } from 'lucide-react'
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
  const [permissionRefresh, setPermissionRefresh] = useState(0)

  const [state, setState] = useState<Omit<Authz, 'can'>>({
    loading: true,
    role: '',
    regionId: null,
    subregionId: null,
    permissions: emptyPermissions(),
  })

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        setPermissionRefresh((current) => current + 1)
      }
    }

    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

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

      const permissions = defaultPermissions(role)
      let hasSavedPermissions = false

      if (!permissionError && saved?.length) {
        hasSavedPermissions = true
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
      }

      // If RLS hides the saved rows (or the table is empty), ask the
      // security-definer permission helper, which is the database authority.
      if (!hasSavedPermissions) {
        const actions: Action[] = ['view', 'add', 'edit', 'delete']
        const effectiveChecks = await Promise.all(
          modules.flatMap((module) =>
            actions.map(async (action) => {
              const { data, error } = await supabase.rpc(
                module === 'Actual' ? 'has_actual_permission' :
                  module === 'Customers' ? 'customers_actual_permission' : 'has_module_permission',
                module === 'Actual' ? { p_action: action } : { p_module: module, p_action: action },
              )

              return { module, action, allowed: data === true, error }
            }),
          ),
        )

        if (!live) return

        const moduleChecks = effectiveChecks.filter((check) => check.module !== 'Actual' && check.module !== 'Customers')
        if (moduleChecks.every((check) => !check.error)) {
          for (const check of moduleChecks) {
            permissions[check.module][check.action] = check.allowed
          }
        } else if (permissionError) {
          Object.assign(permissions, emptyPermissions())
        }

        for (const check of effectiveChecks) {
          if ((check.module === 'Actual' || check.module === 'Customers') && !check.error) {
            permissions[check.module][check.action] = check.allowed
          }
        }
      }

      // A Superuser needs an explicit Approvals grant.
      if (role === 'Superuser' && (permissionError || !saved?.some((row) => row.module === 'Approvals'))) {
        permissions.Approvals.view = false
      }

      for (const moduleName of modules) {
        for (const action of disabledPermissions[moduleName] ?? []) {
          permissions[moduleName][action] = false
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
  }, [pathname, permissionRefresh, router, supabase])

  const pathModule: Record<string, ModuleName> = {
    '/dashboard': 'Dashboard',
    '/forecast-input': 'Forecast Input',
    '/weekly-sales': 'Weekly Sales',
    '/approvals': 'Approvals',
    '/budget': 'Budget',
    '/actual': 'Actual',
    '/categories': 'Categories',
    '/products': 'Products',
    '/customers': 'Customers',
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
        'Forecast Input': '/forecast-input',
        'Weekly Sales': '/weekly-sales',
        Approvals: '/approvals',
        Budget: '/budget',
        Actual: '/actual',
        Categories: '/categories',
        Products: '/products',
        Customers: '/customers',
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
      <div role="status" aria-label="Loading your workspace" className="flex min-h-svh w-full flex-col items-center justify-center gap-5 bg-background p-6">
        <Image src="/vitarich-logo.png" alt="Vitarich" width={96} height={96} preload className="size-24 object-contain" />
        <LoaderCircle aria-hidden="true" className="size-6 animate-spin text-emerald-600 motion-reduce:animate-none dark:text-emerald-400" />
        <span className="sr-only">Loading your workspace…</span>
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
