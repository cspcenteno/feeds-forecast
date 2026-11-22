
'use client'

import { X as ActionXIcon } from 'lucide-react'
import { useActionDialogs } from '@/components/action-dialogs'
import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Image from 'next/image'
import {
  ScrollText,
  RefreshCw,
  LayoutDashboard,
  ClipboardPenLine,
  CalendarDays,
  CheckCircle,
  Wallet,
  ChartColumn,
  Tags,
  Package,
  ContactRound,
  Map,
  MapPinned,
  Users,
  Lock,
  LogOut,
  Moon,
  Sun,
  KeyRound,
  Eye,
  EyeOff,
  LoaderCircle,
  X,
} from 'lucide-react'

import { createClient } from '@/lib/client'
import { useAuthorization } from '@/lib/authorization'
import { useForecastAttention } from '@/lib/use-forecast-attention'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'

const menuItems = [
  {
    title: 'Dashboard',
    url: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Forecasts',
    permissionModule: 'Forecasts',
    url: '/forecasts',
    icon: ClipboardPenLine,
  },
  {
    title: 'Weekly Sales',
    url: '/weekly-sales',
    icon: CalendarDays,
  },
  {
    title: 'Approvals',
    url: '/approvals',
    icon: CheckCircle,
  },
  {
    title: 'Budgets',
    url: '/budgets',
    icon: Wallet,
  },
  {
    title: 'Actuals',
    url: '/actuals',
    icon: ChartColumn,
  },
]

const masterDataItems = [
  {
    title: 'Categories',
    url: '/categories',
    icon: Tags,
  },
  {
    title: 'Products',
    url: '/products',
    icon: Package,
  },
  {
    title: 'Customers',
    url: '/customers',
    icon: ContactRound,
  },
  {
    title: 'Regions',
    url: '/regions',
    icon: Map,
  },
  {
    title: 'Subregions',
    url: '/subregions',
    icon: MapPinned,
  },
]

const adminItems = [
  { title: 'Audit Logs', url: '/audit-logs', icon: ScrollText },
  {
    title: 'Users',
    url: '/users',
    icon: Users,
  },
  {
    title: 'Week Locks',
    url: '/locks',
    icon: Lock,
  },
]

export function AppSidebar() {
  const attention = useForecastAttention()
  const { notify } = useActionDialogs()

  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const { state, isMobile, setOpenMobile } = useSidebar()
  const authorization = useAuthorization()

  const [fullName, setFullName] = useState('User')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [salesPosition, setSalesPosition] = useState('')

  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const profileTriggerRef = useRef<HTMLButtonElement>(null)
  const [darkMode, setDarkMode] = useState(false)

  const [changePasswordOpen, setChangePasswordOpen] =
    useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] =
    useState('')
  const [passwordVisibility, setPasswordVisibility] = useState({ newPassword: false, confirmPassword: false })

  const [changingPassword, setChangingPassword] =
    useState(false)

  useEffect(() => {
    if (!profileOpen) return

    function dismissOutside(event: PointerEvent | FocusEvent) {
      if (event.target instanceof Node && !profileRef.current?.contains(event.target)) {
        setProfileOpen(false)
      }
    }

    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setProfileOpen(false)
        profileTriggerRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', dismissOutside, true)
    document.addEventListener('focusin', dismissOutside)
    document.addEventListener('keydown', dismissOnEscape)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true)
      document.removeEventListener('focusin', dismissOutside)
      document.removeEventListener('keydown', dismissOnEscape)
    }
  }, [profileOpen])

  useEffect(() => {
    let mounted = true

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user || !mounted) return

      setEmail(user.email ?? '')

      const { data: profile, error } = await supabase
        .from('users')
        .select('full_name, role, position, is_active')
        .eq('id', user.id)
        .single()

      if (!mounted) return

      if (error) {
        console.error('Sidebar profile error:', error)
      }

      if (profile?.full_name) {
        setFullName(profile.full_name)
      } else if (user.user_metadata?.full_name) {
        setFullName(user.user_metadata.full_name)
      } else if (user.email) {
        setFullName(user.email.split('@')[0])
      }

      if (profile?.role) {
        setRole(profile.is_active ? profile.role : '')
        setSalesPosition(profile.is_active ? profile.position ?? '' : '')
      }
    }

    loadUser()

    const savedTheme = localStorage.getItem('theme')

    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark')
      setDarkMode(true)
    } else {
      document.documentElement.classList.remove('dark')
      setDarkMode(false)
    }

    return () => {
      mounted = false
    }
  }, [supabase])

  function getInitials(name: string) {
    const parts = name
      .trim()
      .split(/\s+/)
      .filter(Boolean)

    if (parts.length === 0) return 'U'

    if (parts.length === 1) {
      return parts[0].substring(0, 2).toUpperCase()
    }

    return (
      parts[0].charAt(0) +
      parts[parts.length - 1].charAt(0)
    ).toUpperCase()
  }

  function toggleDarkMode() {
    const nextDarkMode = !darkMode

    setDarkMode(nextDarkMode)

    if (nextDarkMode) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }

  function openChangePassword() {
    setProfileOpen(false)
    setNewPassword('')
    setConfirmPassword('')
    setPasswordVisibility({ newPassword: false, confirmPassword: false })
    setChangePasswordOpen(true)
  }

  function closeChangePassword() {
    if (changingPassword) return

    setChangePasswordOpen(false)
    setNewPassword('')
    setConfirmPassword('')
  }

  async function handleChangePassword() {
    if (!newPassword) {
      notify('Please enter your new password.')
      return
    }

    if (newPassword.length < 8) {
      notify('Password must be at least 8 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      notify('Passwords do not match.')
      return
    }

    setChangingPassword(true)

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      console.error('Change Password Error:', error)
      notify(error.message)
      setChangingPassword(false)
      return
    }

    notify('Your password has been changed successfully.')

    setChangingPassword(false)
    setChangePasswordOpen(false)
    setNewPassword('')
    setConfirmPassword('')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const visibleMenuItems = menuItems.filter((item) => authorization.can((item.permissionModule ?? item.title) as import('@/lib/authorization').ModuleName, 'view'))
  const visibleMasterDataItems = masterDataItems.filter((item) => authorization.can(item.title as import('@/lib/authorization').ModuleName, 'view'))
  const visibleAdminItems = adminItems.filter((item) => authorization.can(item.title as import('@/lib/authorization').ModuleName, 'view'))
  const canAccessMasterData = visibleMasterDataItems.length > 0
  const canAccessAdministration = visibleAdminItems.length > 0

  function isCurrentPage(url: string) {
    return pathname === url || pathname.startsWith(`${url}/`)
  }

  function navigateTo(url: string) {
    setProfileOpen(false)
    if (isMobile) setOpenMobile(false)
    router.push(url)
  }

  return (
    <>
      <Sidebar collapsible="icon" className="app-sidebar">
        <SidebarContent>
          {/* Application Header */}
          <div className="flex h-20 shrink-0 items-center overflow-hidden px-2 group-data-[collapsible=icon]:justify-center">
            <div className="flex min-w-0 flex-1 items-center gap-2.5 group-data-[collapsible=icon]:hidden">
              <Image src="/vitarich-logo.png" alt="Vitarich Corporation" width={40} height={40} className="size-10 shrink-0 object-contain" />
              <p className="shrink-0 whitespace-nowrap text-lg leading-tight font-bold tracking-tight">
                Feeds<br /><span className="font-semibold">Forecast</span>
              </p>
            </div>

            <SidebarTrigger
              className="size-8 shrink-0 group-data-[collapsible=icon]:mx-auto"
              title={
                state === 'collapsed'
                  ? 'Expand sidebar'
                  : 'Collapse sidebar'
              }
            />
          </div>

          {/* Main Menu */}
          <SidebarGroup>
            <SidebarGroupLabel>
              <span>Main Menu</span>
            </SidebarGroupLabel>

            <SidebarGroupContent>
              <SidebarMenu>
                {visibleMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      isActive={isCurrentPage(item.url)}
                      aria-current={isCurrentPage(item.url) ? 'page' : undefined}
                      onClick={() => navigateTo(item.url)}
                      tooltip={item.title}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                      {attention && (item.url === '/forecasts' ? attention.returnedCustomers : item.url === '/approvals' ? attention.pending + attention.endorsed : 0) > 0 && (
                        <span data-slot="forecast-attention-badge" className={'ml-auto flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:top-0 group-data-[collapsible=icon]:right-0 ' + (item.url === '/forecasts'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200'
                          : attention.pending > 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200')}
                          title={item.url === '/forecasts' ? `${attention.returnedCustomers} customers returned for revision` : `${attention.pending} KAMs awaiting endorsement · ${attention.endorsed} RSMs awaiting approval`}
                          aria-label={item.url === '/forecasts' ? `${attention.returnedCustomers} customers with returned forecasts` : `${attention.pending + attention.endorsed} review groups awaiting review`}>
                          {item.url === '/forecasts' ? attention.returnedCustomers : attention.pending + attention.endorsed}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Master Data */}
          {canAccessMasterData && (
            <SidebarGroup>
              <SidebarGroupLabel>
                <span>Master Data</span>
              </SidebarGroupLabel>

              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleMasterDataItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        isActive={isCurrentPage(item.url)}
                        aria-current={isCurrentPage(item.url) ? 'page' : undefined}
                        onClick={() => navigateTo(item.url)}
                        tooltip={item.title}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* Administration */}
          {canAccessAdministration && (
            <SidebarGroup>
              <SidebarGroupLabel>
                <span>Administration</span>
              </SidebarGroupLabel>

              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleAdminItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        isActive={isCurrentPage(item.url)}
                        aria-current={isCurrentPage(item.url) ? 'page' : undefined}
                        onClick={() => navigateTo(item.url)}
                        tooltip={item.title}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* User Profile */}
          <SidebarGroup className="mt-auto shrink-0">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <div ref={profileRef} className="relative">
                    <button
                      ref={profileTriggerRef}
                      type="button"
                      aria-label="Profile options"
                      aria-expanded={profileOpen}
                      aria-controls={profileOpen ? 'profile-options' : undefined}
                      onClick={() => setProfileOpen(!profileOpen)}
                      className="flex h-14 w-full items-center justify-start gap-2 rounded-md py-2 text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                        {getInitials(fullName)}
                      </div>

                      <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                        <p className="truncate text-sm font-medium">
                          {fullName}
                        </p>

                        <p className="truncate text-xs text-muted-foreground">
                          {email}
                        </p>
                      </div>
                    </button>

                    {/* Profile Menu */}
                    {profileOpen && (
                      <div
                        id="profile-options"
                        className="
                          absolute bottom-full left-0 z-50 mb-2 w-full min-w-[220px]
                          rounded-lg border bg-popover p-1 text-popover-foreground shadow-md
                          group-data-[collapsible=icon]:fixed
                          group-data-[collapsible=icon]:bottom-14
                          group-data-[collapsible=icon]:left-2
                          group-data-[collapsible=icon]:w-[220px]
                          group-data-[collapsible=icon]:min-w-0
                          group-data-[collapsible=icon]:mb-0
                        "
                      >
                        <div className="space-y-1 px-3 py-3">
                          <p className="text-sm leading-5 font-medium wrap-anywhere">
                            {fullName}
                          </p>

                          <p className="text-xs leading-4 text-muted-foreground wrap-anywhere">
                            {email}
                          </p>

                          <p className="text-xs leading-4 text-muted-foreground">
                            {role || 'Inactive account'}
                            {role && salesPosition && <> · {salesPosition}</>}
                          </p>
                        </div>

                        <div className="mx-2 my-1 h-px bg-border" />

                        <button data-action-tone="neutral"
                          data-slot="profile-menu-action"
                          type="button"
                          onClick={() => window.location.reload()}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
                          title="Reload the page to fetch current data and settings. Unsaved changes will be lost."
                        >
                          <RefreshCw className="size-4" aria-hidden="true" />
                          <span>Refresh App</span>
                        </button>

                        {/* Change Password */}
                        <button data-action-tone="caution"
                          data-slot="profile-menu-action"
                          type="button"
                          onClick={openChangePassword}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
                        >
                          <KeyRound className="size-4" />
                          <span>Change Password</span>
                        </button>

                        {/* Theme */}
                        <button
                          data-action-tone="neutral"
                          data-slot="profile-menu-action"
                          type="button"
                          onClick={toggleDarkMode}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
                        >
                          {darkMode ? (
                            <Sun className="size-4" />
                          ) : (
                            <Moon className="size-4" />
                          )}

                          <span>
                            {darkMode ? 'Light Mode' : 'Dark Mode'}
                          </span>
                        </button>

                        {/* Logout */}
                        <button data-action-tone="danger"
                          data-slot="profile-menu-action"
                          type="button"
                          onClick={handleLogout}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
                        >
                          <LogOut className="size-4" />
                          <span>Logout</span>
                        </button>
                      </div>
                    )}
                  </div>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      {/* Change Password Dialog */}
      {changePasswordOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div data-app-dialog role="dialog" aria-modal="true" aria-labelledby="change-password-title" aria-describedby="change-password-description" aria-busy={changingPassword}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border bg-card shadow-xl">
            <div className="flex items-start justify-between gap-3 px-6 pt-6">
              <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sidebar-accent text-sidebar-accent-foreground">
                  <KeyRound className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 data-section-title="" id="change-password-title" className="text-lg font-semibold tracking-tight">Change password</h2>
                  <p id="change-password-description" className="mt-1 text-xs text-muted-foreground">Choose a new password for your account.</p>
                </div>
              </div>
              <button type="button" onClick={closeChangePassword} disabled={changingPassword} aria-label="Close change password dialog"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50">
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-6">
              {[
                { id: 'newPassword' as const, label: 'New password', value: newPassword, update: setNewPassword, placeholder: 'Enter new password' },
                { id: 'confirmPassword' as const, label: 'Confirm password', value: confirmPassword, update: setConfirmPassword, placeholder: 'Re-enter new password' },
              ].map(({ id, label, value, update, placeholder }) => (
                <div key={id} className="space-y-2">
                  <label htmlFor={id} className="text-sm font-medium">{label}</label>
                  <div className="relative">
                    <input id={id} type={passwordVisibility[id] ? 'text' : 'password'} value={value} onChange={(event) => update(event.target.value)} placeholder={placeholder}
                      autoComplete="new-password" minLength={8} disabled={changingPassword} aria-describedby={id === 'newPassword' ? 'new-password-hint' : undefined}
                      className="h-11 w-full rounded-lg border bg-background py-2 pr-12 pl-3 text-base outline-none transition focus:border-emerald-600 focus:ring-3 focus:ring-emerald-600/10 disabled:opacity-50 sm:text-sm dark:focus:border-emerald-400" />
                    <button type="button" disabled={changingPassword} aria-label={`${passwordVisibility[id] ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={passwordVisibility[id]}
                      onClick={() => setPasswordVisibility((previous) => ({ ...previous, [id]: !previous[id] }))}
                      className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50 dark:hover:text-emerald-400">
                      {passwordVisibility[id] ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                    </button>
                  </div>
                  {id === 'newPassword' && <p id="new-password-hint" className="text-xs text-muted-foreground">Use at least 8 characters.</p>}
                </div>
              ))}
            </div>

            <div data-action-toolbar="" className="flex flex-wrap justify-end gap-2 border-t px-6 py-4">
              <button data-action-tone="neutral" type="button" onClick={closeChangePassword} disabled={changingPassword}
                className="h-10 rounded-lg border px-4 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50"><ActionXIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />Cancel</button>
              <button data-action-tone="primary" data-action-fill="" type="button" onClick={handleChangePassword} disabled={changingPassword}
                className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#174c36] px-4 text-sm font-semibold text-white outline-none transition hover:bg-[#103b29] focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:bg-emerald-700 dark:hover:bg-emerald-600">
                {changingPassword && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {changingPassword ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
