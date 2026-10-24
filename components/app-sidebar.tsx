
'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ClipboardPenLine,
  CalendarDays,
  CheckCircle,
  Wallet,
  Tags,
  Package,
  Map,
  MapPinned,
  Users,
  Lock,
  LogOut,
  Moon,
  Sun,
  KeyRound,
  X,
} from 'lucide-react'

import { createClient } from '@/lib/client'
import { useAuthorization } from '@/lib/authorization'

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
    title: 'Sales Input',
    url: '/sales-input',
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
    title: 'Budget',
    url: '/budget',
    icon: Wallet,
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
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const { state } = useSidebar()
  const authorization = useAuthorization()

  const [fullName, setFullName] = useState('User')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')

  const [profileOpen, setProfileOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(false)

  const [changePasswordOpen, setChangePasswordOpen] =
    useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] =
    useState('')

  const [changingPassword, setChangingPassword] =
    useState(false)

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
        .select('full_name, role, is_active')
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
      alert('Please enter your new password.')
      return
    }

    if (newPassword.length < 6) {
      alert('Password must be at least 6 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      alert('Passwords do not match.')
      return
    }

    setChangingPassword(true)

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      console.error('Change Password Error:', error)
      alert(error.message)
      setChangingPassword(false)
      return
    }

    alert('Your password has been changed successfully.')

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

  const visibleMenuItems = menuItems.filter((item) => authorization.can(item.title as import('@/lib/authorization').ModuleName, 'view'))
  const visibleMasterDataItems = masterDataItems.filter((item) => authorization.can(item.title as import('@/lib/authorization').ModuleName, 'view'))
  const visibleAdminItems = adminItems.filter((item) => authorization.can(item.title === 'Week Locks' ? 'Week Locks' : 'Users', 'view'))
  const canAccessMasterData = visibleMasterDataItems.length > 0
  const canAccessAdministration = visibleAdminItems.length > 0

  function isCurrentPage(url: string) {
    return pathname === url || pathname.startsWith(`${url}/`)
  }

  function navigateTo(url: string) {
    setProfileOpen(false)
    router.push(url)
  }

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarContent>
          {/* Application Header */}
          <div className="flex items-center px-2 py-4 group-data-[collapsible=icon]:justify-center">
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-base font-semibold tracking-tight">
                Feed Sales
              </p>

              <p className="truncate text-xs text-muted-foreground">
                Forecast
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
              Main Menu
            </SidebarGroupLabel>

            <SidebarGroupContent>
              <SidebarMenu>
                {visibleMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      isActive={isCurrentPage(item.url)}
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

          {/* Master Data */}
          {canAccessMasterData && (
            <SidebarGroup>
              <SidebarGroupLabel>
                Master Data
              </SidebarGroupLabel>

              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleMasterDataItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        isActive={isCurrentPage(item.url)}
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
                Administration
              </SidebarGroupLabel>

              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleAdminItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        isActive={isCurrentPage(item.url)}
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
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setProfileOpen(!profileOpen)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center"
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
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
                        <div className="px-3 py-2">
                          <p className="truncate text-sm font-medium">
                            {fullName}
                          </p>

                          <p className="truncate text-xs text-muted-foreground">
                            {email}
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            {role || 'Inactive account'}
                          </p>
                        </div>

                        <div className="my-1 h-px bg-border" />

                        {/* Change Password */}
                        <button
                          type="button"
                          onClick={openChangePassword}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
                        >
                          <KeyRound className="size-4" />
                          <span>Change Password</span>
                        </button>

                        {/* Theme */}
                        <button
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
                        <button
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">
                  Change Password
                </h2>

                <p className="text-sm text-muted-foreground">
                  Enter a new password for your account.
                </p>
              </div>

              <button
                type="button"
                onClick={closeChangePassword}
                disabled={changingPassword}
                aria-label="Close change password dialog"
                className="rounded-md p-2 hover:bg-muted disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="space-y-2">
                <label
                  htmlFor="newPassword"
                  className="text-sm font-medium"
                >
                  New Password
                </label>

                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  disabled={changingPassword}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                />

                <p className="text-xs text-muted-foreground">
                  Password must be at least 6 characters.
                </p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="confirmPassword"
                  className="text-sm font-medium"
                >
                  Confirm Password
                </label>

                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  disabled={changingPassword}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <button
                type="button"
                onClick={closeChangePassword}
                disabled={changingPassword}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleChangePassword}
                disabled={changingPassword}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {changingPassword ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
