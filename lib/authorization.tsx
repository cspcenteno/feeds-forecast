
'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import { LoaderCircle, RefreshCw, ShieldLock } from 'lucide-react'
import { Button } from '@/components/ui/button'

import {
  emptyPermissions,
  modules,
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
  const [loadError, setLoadError] = useState('')
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
      setLoadError('')
      try {
        const response = await fetch('/api/authorization', { cache: 'no-store' })
        if (!live) return
        if (response.status === 401 || response.status === 403) {
          router.replace('/login')
          return
        }
        if (!response.ok) throw new Error('Unable to load your access permissions.')
        const access = await response.json() as Omit<Authz, 'can' | 'loading'>
        if (!live) return
        setState({ ...access, loading: false })
      } catch {
        if (live) setLoadError('Unable to load your access permissions. Please try again.')
      }
    })()

    return () => {
      live = false
    }
  }, [pathname, permissionRefresh, router])

  const pathModule: Record<string, ModuleName> = {
    '/dashboard': 'Dashboard',
    '/forecasts': 'Forecasts',
    '/weekly-sales': 'Weekly Sales',
    '/approvals': 'Approvals',
    '/budgets': 'Budgets',
    '/actuals': 'Actuals',
    '/categories': 'Categories',
    '/products': 'Products',
    '/customers': 'Customers',
    '/regions': 'Regions',
    '/subregions': 'Subregions',
    '/users': 'Users',
    '/locks': 'Week Locks',
    '/audit-logs': 'Audit Logs',
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
        'Forecasts': '/forecasts',
        'Weekly Sales': '/weekly-sales',
        Approvals: '/approvals',
        Budgets: '/budgets',
        Actuals: '/actuals',
        Categories: '/categories',
        Products: '/products',
        Customers: '/customers',
        Regions: '/regions',
        Subregions: '/subregions',
        Users: '/users',
        'Week Locks': '/locks',
        'Audit Logs': '/audit-logs',
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

  if (loadError) {
    return (
      <div role="alert" className="p-6 text-sm text-muted-foreground">
        <p>{loadError}</p>
        <button type="button" className="mt-3 underline" onClick={() => setPermissionRefresh((current) => current + 1)}>
          Try again
        </button>
      </div>
    )
  }

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
      <div className="flex min-h-svh w-full min-w-0 items-center justify-center bg-background p-4 sm:p-6">
        <section aria-labelledby="access-restricted-title" className="w-full max-w-md rounded-2xl border bg-card p-6 text-center text-card-foreground shadow-sm sm:p-8">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400">
            <ShieldLock aria-hidden="true" className="size-6" />
          </div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{currentModule}</p>
          <h1 id="access-restricted-title" className="text-xl font-semibold tracking-tight">Access restricted</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Your account doesn’t have access to this module. Contact your administrator to review your permissions.
          </p>
          <div className="mt-6 border-t pt-5">
            <p className="mb-3 text-xs leading-5 text-muted-foreground">If your permissions were recently updated, refresh your access.</p>
            <Button variant="outline" onClick={() => setPermissionRefresh((current) => current + 1)}>
              <RefreshCw aria-hidden="true" className="size-4" />
              Refresh access
            </Button>
          </div>
        </section>
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
