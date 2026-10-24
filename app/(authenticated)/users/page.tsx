
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Pencil,
  Trash2,
  RefreshCw,
  ShieldCheck,
  Plus,
  X,
} from 'lucide-react'

import { createClient } from '@/lib/client'
import {
  defaultPermissions as sharedDefaultPermissions,
  disabledPermissions,
  modules,
} from '@/lib/authorization'
import type { Action, ModuleName } from '@/lib/authorization'

type User = {
  id: string
  email: string
  full_name: string | null
  role: string
  region_id: number | null
  subregion_id: number | null
  position: string | null
  is_active: boolean
  created_at: string
}

type Region = {
  id: number
  name: string
}

type Subregion = {
  id: number
  name: string
  region_id: number
}

const roles = ['User', 'Superuser', 'Manager', 'Admin'] as const

type PermissionField =
  | 'can_view'
  | 'can_add'
  | 'can_edit'
  | 'can_delete'

type ModulePermission = {
  module: ModuleName
  can_view: boolean
  can_add: boolean
  can_edit: boolean
  can_delete: boolean
}

const permissionFields: {
  field: PermissionField
  label: string
}[] = [
  { field: 'can_view', label: 'View' },
  { field: 'can_add', label: 'Add' },
  { field: 'can_edit', label: 'Edit' },
  { field: 'can_delete', label: 'Delete' },
]

function createDefaultPermissions(): ModulePermission[] {
  return modules.map((module) => ({
    module,
    can_view: false,
    can_add: false,
    can_edit: false,
    can_delete: false,
  }))
}

function isPermissionDisabled(
  module: ModuleName,
  field: PermissionField,
) {
  return (disabledPermissions[module] ?? []).includes(
    field.replace('can_', '') as Action,
  )
}

function normalizePermission(
  permission: ModulePermission,
): ModulePermission {
  const normalized = { ...permission }

  for (const { field } of permissionFields) {
    if (isPermissionDisabled(permission.module, field)) {
      normalized[field] = false
    }
  }

  return normalized
}

function getDefaultPermissions(role: string): ModulePermission[] {
  const shared = sharedDefaultPermissions(role)

  return modules.map((module) =>
    normalizePermission({
      module,
      can_view: shared[module].view,
      can_add: shared[module].add,
      can_edit: shared[module].edit,
      can_delete: shared[module].delete,
    }),
  )
}

export default function UsersPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  const [users, setUsers] = useState<User[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [subregions, setSubregions] = useState<Subregion[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  // Edit User state
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [position, setPosition] = useState('')
  const [role, setRole] = useState<string>('User')
  const [regionId, setRegionId] = useState<number | null>(null)
  const [subregionId, setSubregionId] = useState<number | null>(null)
  const [isActive, setIsActive] = useState(false)

  // Create User state
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [creatingUser, setCreatingUser] = useState(false)
  const [newFullName, setNewFullName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newTemporaryPassword, setNewTemporaryPassword] = useState('')
  const [newRole, setNewRole] = useState<string>('User')
  const [newRegionId, setNewRegionId] = useState<number | null>(null)
  const [newSubregionId, setNewSubregionId] = useState<number | null>(null)
  const [newPosition, setNewPosition] = useState('')

  // Permissions for new and existing users
  const [newPermissions, setNewPermissions] = useState<ModulePermission[]>(
    () => getDefaultPermissions('User'),
  )

  const [permissions, setPermissions] = useState<ModulePermission[]>(
    () => createDefaultPermissions(),
  )

  const [hasSavedPermissions, setHasSavedPermissions] = useState(false)
  const [loadingPermissions, setLoadingPermissions] = useState(false)
  const [permissionLoadError, setPermissionLoadError] = useState(false)

  useEffect(() => {
    checkAccess()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function checkAccess() {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const { data: profile, error } = await supabase
      .from('users')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (error || profile?.role !== 'Admin' || !profile?.is_active) {
      router.push('/dashboard')
      return
    }

    setIsAdmin(true)

    await Promise.all([
      loadUsers(),
      loadRegions(),
      loadSubregions(),
    ])

    setLoading(false)
  }

  async function loadUsers() {
    const { data, error } = await supabase
      .from('users')
      .select(`
        id,
        email,
        full_name,
        role,
        region_id,
        subregion_id,
        position,
        is_active,
        created_at
      `)
      .order('full_name', { ascending: true })

    if (error) {
      console.error('Users Select Error:', error)
      alert(`Unable to load users: ${error.message}`)
      return
    }

    setUsers((data ?? []) as User[])
  }

  async function loadRegions() {
    const { data, error } = await supabase
      .from('regions')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (error) {
      console.error('Regions Select Error:', error)
      alert(`Unable to load regions: ${error.message}`)
      return
    }

    setRegions((data ?? []) as Region[])
  }

  async function loadSubregions() {
    const { data, error } = await supabase
      .from('subregions')
      .select('id, name, region_id')
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (error) {
      console.error('Subregions Select Error:', error)
      alert(`Unable to load subregions: ${error.message}`)
      return
    }

    setSubregions((data ?? []) as Subregion[])
  }

  async function handleRefresh() {
    setRefreshing(true)

    try {
      await Promise.all([
        loadUsers(),
        loadRegions(),
        loadSubregions(),
      ])

      if (selectedUser) {
        await loadUserPermissions(selectedUser.id, role)
      }
    } finally {
      setRefreshing(false)
    }
  }

  async function loadUserPermissions(
    userId: string,
    selectedRole: string,
  ) {
    setLoadingPermissions(true)
    setPermissionLoadError(false)

    const { data, error } = await supabase
      .from('user_permissions')
      .select(`
        module,
        can_view,
        can_add,
        can_edit,
        can_delete,
        is_default
      `)
      .eq('user_id', userId)

    if (error) {
      console.error('User Permissions Select Error:', error)
      setPermissionLoadError(true)
      setLoadingPermissions(false)
      alert(`Unable to load user permissions: ${error.message}`)
      return
    }

    if (
      !data ||
      data.length === 0 ||
      data.every((item) => item.is_default)
    ) {
      setHasSavedPermissions(false)
      setPermissions(getDefaultPermissions(selectedRole))
      setLoadingPermissions(false)
      return
    }

    const savedPermissions = new Map(
      data.map((item) => [item.module, item]),
    )

    const mergedPermissions: ModulePermission[] = modules.map(
      (module) => {
        const saved = savedPermissions.get(module)

        return normalizePermission({
          module,
          can_view: saved?.can_view ?? false,
          can_add: saved?.can_add ?? false,
          can_edit: saved?.can_edit ?? false,
          can_delete: saved?.can_delete ?? false,
        })
      },
    )

    setHasSavedPermissions(true)
    setPermissions(mergedPermissions)
    setLoadingPermissions(false)
  }

  async function selectUser(user: User) {
    setShowCreateUser(false)
    setSelectedUser(user)
    setFullName(user.full_name ?? '')
    setEmail(user.email)
    setPosition(user.position ?? '')
    setRole(user.role)
    setRegionId(user.region_id)
    setSubregionId(user.subregion_id)
    setIsActive(user.is_active)

    await loadUserPermissions(user.id, user.role)
  }

  function handleRoleChange(newRole: string) {
    setRole(newRole)

    if (!hasSavedPermissions) {
      setPermissions(getDefaultPermissions(newRole))
    }

    if (newRole === 'Admin') {
      setRegionId(null)
      setSubregionId(null)
    }
  }

  function clearSelection() {
    setSelectedUser(null)
    setFullName('')
    setEmail('')
    setPosition('')
    setRole('User')
    setRegionId(null)
    setSubregionId(null)
    setIsActive(false)
    setPermissions(createDefaultPermissions())
    setHasSavedPermissions(false)
    setLoadingPermissions(false)
    setPermissionLoadError(false)
  }

  function resetCreateUserForm() {
    setNewFullName('')
    setNewEmail('')
    setNewTemporaryPassword('')
    setNewRole('User')
    setNewRegionId(null)
    setNewSubregionId(null)
    setNewPosition('')
    setNewPermissions(getDefaultPermissions('User'))
    setShowCreateUser(false)
  }

  function openCreateUserForm() {
    clearSelection()
    resetCreateUserForm()
    setNewPermissions(getDefaultPermissions('User'))
    setShowCreateUser(true)
  }

  function handleNewRoleChange(newRole: string) {
    setNewRole(newRole)
    setNewPermissions(getDefaultPermissions(newRole))

    if (newRole === 'Admin') {
      setNewRegionId(null)
      setNewSubregionId(null)
    }
  }

  function updateNewPermission(
    module: ModuleName,
    field: PermissionField,
    checked: boolean,
  ) {
    if (isPermissionDisabled(module, field)) return

    setNewPermissions((current) =>
      current.map((permission) =>
        permission.module === module
          ? normalizePermission({
              ...permission,
              [field]: checked,
            })
          : permission,
      ),
    )
  }

  function toggleNewModulePermissions(
    module: ModuleName,
    checked: boolean,
  ) {
    setNewPermissions((current) =>
      current.map((permission) => {
        if (permission.module !== module) return permission

        const updated = { ...permission }

        permissionFields.forEach(({ field }) => {
          if (!isPermissionDisabled(module, field)) {
            updated[field] = checked
          }
        })

        return normalizePermission(updated)
      }),
    )
  }

  function toggleAllNewPermissions(checked: boolean) {
    setNewPermissions((current) =>
      current.map((permission) => {
        const updated = { ...permission }

        permissionFields.forEach(({ field }) => {
          if (!isPermissionDisabled(permission.module, field)) {
            updated[field] = checked
          }
        })

        return normalizePermission(updated)
      }),
    )
  }

  function updatePermission(
    module: ModuleName,
    field: PermissionField,
    checked: boolean,
  ) {
    if (isPermissionDisabled(module, field)) return

    setPermissions((current) =>
      current.map((permission) =>
        permission.module === module
          ? normalizePermission({
              ...permission,
              [field]: checked,
            })
          : permission,
      ),
    )
  }

  function toggleModulePermissions(
    module: ModuleName,
    checked: boolean,
  ) {
    setPermissions((current) =>
      current.map((permission) => {
        if (permission.module !== module) return permission

        const updated = { ...permission }

        permissionFields.forEach(({ field }) => {
          if (!isPermissionDisabled(module, field)) {
            updated[field] = checked
          }
        })

        return normalizePermission(updated)
      }),
    )
  }

  function toggleAllPermissions(checked: boolean) {
    setPermissions((current) =>
      current.map((permission) => {
        const updated = { ...permission }

        permissionFields.forEach(({ field }) => {
          if (!isPermissionDisabled(permission.module, field)) {
            updated[field] = checked
          }
        })

        return normalizePermission(updated)
      }),
    )
  }

  async function handleCreateUser() {
    if (!newFullName.trim()) {
      alert('Please enter the full name.')
      return
    }

    if (!newEmail.trim()) {
      alert('Please enter the email address.')
      return
    }

    if (newTemporaryPassword.length < 8) {
      alert('The temporary password must be at least 8 characters.')
      return
    }

    if (newTemporaryPassword.length > 128) {
      alert('The temporary password must not exceed 128 characters.')
      return
    }

    if (!roles.includes(newRole as (typeof roles)[number])) {
      alert('Please select a valid role.')
      return
    }

    if (newRole !== 'Admin' && newRegionId === null) {
      alert('Please select a region.')
      return
    }

    if (
      newRole !== 'Admin' &&
      newSubregionId !== null &&
      !subregions.some(
        (subregion) =>
          subregion.id === newSubregionId &&
          subregion.region_id === newRegionId,
      )
    ) {
      alert('Please select a subregion belonging to the selected region.')
      return
    }

    setCreatingUser(true)

    try {
      const normalizedNewPermissions = newPermissions.map(
        normalizePermission,
      )

      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: newFullName.trim(),
          email: newEmail.trim().toLowerCase(),
          temporaryPassword: newTemporaryPassword,
          role: newRole,
          regionId: newRole === 'Admin' ? null : newRegionId,
          subregionId: newRole === 'Admin' ? null : newSubregionId,
          position: newPosition.trim(),
          permissions: normalizedNewPermissions.map((permission) => ({
            module: permission.module,
            can_view: permission.can_view,
            can_add: permission.can_add,
            can_edit: permission.can_edit,
            can_delete: permission.can_delete,
          })),
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        alert(result.error || 'Unable to create the user.')
        return
      }

      await loadUsers()
      resetCreateUserForm()

      alert(
        'User created successfully. Share the temporary password securely. The user must change it after signing in.',
      )
    } catch (error) {
      console.error('Create User Error:', error)
      alert('Unable to connect to the server. Please try again.')
    } finally {
      setCreatingUser(false)
    }
  }

  
  // Save both profile details and permissions through the server API.
  async function handleSave() {
    if (!selectedUser) return

    if (!fullName.trim()) {
      alert('Please enter the full name.')
      return
    }

    if (fullName.trim().length > 150) {
      alert('Full name must not exceed 150 characters.')
      return
    }

    if (position.trim().length > 150) {
      alert('Position must not exceed 150 characters.')
      return
    }

    if (!roles.includes(role as (typeof roles)[number])) {
      alert('Please select a valid role.')
      return
    }

    if (role !== 'Admin' && regionId === null) {
      alert('Please select a region.')
      return
    }

    if (
      role !== 'Admin' &&
      subregionId !== null &&
      !subregions.some(
        (subregion) =>
          subregion.id === subregionId &&
          subregion.region_id === regionId,
      )
    ) {
      alert('Please select a subregion belonging to the selected region.')
      return
    }

    if (loadingPermissions || permissionLoadError) {
      alert(
        'Please ensure user permissions have loaded successfully before saving.',
      )
      return
    }

    setSaving(true)

    try {
      const normalizedPermissions = permissions.map(normalizePermission)

      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: selectedUser.id,
          fullName: fullName.trim(),
          position: position.trim(),
          role,
          regionId: role === 'Admin' ? null : regionId,
          subregionId: role === 'Admin' ? null : subregionId,
          isActive,
          permissions: normalizedPermissions.map((permission) => ({
            module: permission.module,
            can_view: permission.can_view,
            can_add: permission.can_add,
            can_edit: permission.can_edit,
            can_delete: permission.can_delete,
          })),
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        // The profile might have been saved even if the permission save failed.
        if (result.profileSaved && result.user) {
          const updatedUser = result.user as User

          setUsers((currentUsers) =>
            currentUsers
              .map((user) =>
                user.id === updatedUser.id ? updatedUser : user,
              )
              .sort((a, b) =>
                (a.full_name ?? '').localeCompare(b.full_name ?? ''),
              ),
          )

          setSelectedUser(updatedUser)
          setFullName(updatedUser.full_name ?? '')
          setEmail(updatedUser.email)
          setPosition(updatedUser.position ?? '')
          setRole(updatedUser.role)
          setRegionId(updatedUser.region_id)
          setSubregionId(updatedUser.subregion_id)
          setIsActive(updatedUser.is_active)
        }

        alert(result.error || 'Unable to save changes.')
        return
      }

      if (!result.user) {
        alert('The server did not return the updated user record.')
        return
      }

      const updatedUser = result.user as User

      setUsers((currentUsers) =>
        currentUsers
          .map((user) =>
            user.id === updatedUser.id ? updatedUser : user,
          )
          .sort((a, b) =>
            (a.full_name ?? '').localeCompare(b.full_name ?? ''),
          ),
      )

      setSelectedUser(updatedUser)
      setFullName(updatedUser.full_name ?? '')
      setEmail(updatedUser.email)
      setPosition(updatedUser.position ?? '')
      setRole(updatedUser.role)
      setRegionId(updatedUser.region_id)
      setSubregionId(updatedUser.subregion_id)
      setIsActive(updatedUser.is_active)

      setPermissions(normalizedPermissions)
      setHasSavedPermissions(true)
      setPermissionLoadError(false)

      alert('User details and permissions saved successfully.')
    } catch (error) {
      console.error('Save User Error:', error)

      alert(
        error instanceof Error
          ? `Unable to save changes: ${error.message}`
          : 'Unable to save changes. Please try again.',
      )
    } finally {
      setSaving(false)
    }
  }


  async function handleDelete() {
    if (!selectedUser) return

    const confirmed = window.confirm(
      `Are you sure you want to delete ${
        selectedUser.full_name || selectedUser.email
      }?`,
    )

    if (!confirmed) return

    setDeleting(true)

    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', selectedUser.id)

      if (error) {
        console.error('User Delete Error:', error)
        alert(`Unable to delete user: ${error.message}`)
        return
      }

      setUsers((currentUsers) =>
        currentUsers.filter((user) => user.id !== selectedUser.id),
      )

      clearSelection()
    } finally {
      setDeleting(false)
    }
  }

  function getRegionName(id: number | null) {
    if (id === null) return 'All Regions'

    return regions.find((region) => region.id === id)?.name ?? '—'
  }

  function getSubregionName(id: number | null) {
    if (id === null) return '—'

    return subregions.find((subregion) => subregion.id === id)?.name ?? '—'
  }

  const availableSubregions = subregions.filter(
    (subregion) => subregion.region_id === regionId,
  )

  const availableNewSubregions = subregions.filter(
    (subregion) => subregion.region_id === newRegionId,
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading users...</p>
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div className="space-y-6">
      {/* User Accounts */}
      <div className="rounded-xl border bg-background">
        <div className="flex flex-col gap-3 border-b px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">User Accounts</h2>
            <p className="text-sm text-muted-foreground">
              {users.length} user{users.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openCreateUserForm}
              disabled={creatingUser}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="size-4" />
              Add User
            </button>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw
                className={`size-4 ${refreshing ? 'animate-spin' : ''}`}
              />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-6 py-3 text-left font-medium">Full Name</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Region</th>
                <th className="px-4 py-3 text-left font-medium">Subregion</th>
                <th className="px-4 py-3 text-left font-medium">Position</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Action</th>
              </tr>
            </thead>

            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-8 text-center text-muted-foreground"
                  >
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className={`border-b last:border-0 ${
                      selectedUser?.id === user.id ? 'bg-muted/40' : ''
                    }`}
                  >
                    <td className="px-6 py-3">{user.full_name || '—'}</td>
                    <td className="px-4 py-3">{user.email}</td>
                    <td className="px-4 py-3">{user.role}</td>
                    <td className="px-4 py-3">
                      {getRegionName(user.region_id)}
                    </td>
                    <td className="px-4 py-3">
                      {getSubregionName(user.subregion_id)}
                    </td>
                    <td className="px-4 py-3">{user.position || '—'}</td>
                    <td className="px-4 py-3">
                      {user.is_active ? 'Active' : 'Pending'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => selectUser(user)}
                        className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                      >
                        <Pencil className="size-4" />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User */}
      {showCreateUser && (
        <div className="rounded-xl border bg-background">
          <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
            <div>
              <h2 className="font-semibold">Create User</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Create an account and assign its initial role and permissions.
              </p>
            </div>

            <button
              type="button"
              onClick={resetCreateUserForm}
              disabled={creatingUser}
              aria-label="Close Create User form"
              className="rounded-md p-1.5 hover:bg-muted disabled:opacity-50"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="grid gap-4 p-6 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="newFullName" className="text-sm font-medium">
                Full Name <span className="text-destructive">*</span>
              </label>
              <input
                id="newFullName"
                type="text"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                maxLength={150}
                autoComplete="name"
                required
                disabled={creatingUser}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                placeholder="Enter full name"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="newEmail" className="text-sm font-medium">
                Email <span className="text-destructive">*</span>
              </label>
              <input
                id="newEmail"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                maxLength={254}
                autoComplete="off"
                required
                disabled={creatingUser}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                placeholder="user@company.com"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="newTemporaryPassword"
                className="text-sm font-medium"
              >
                Temporary Password <span className="text-destructive">*</span>
              </label>
              <input
                id="newTemporaryPassword"
                type="password"
                value={newTemporaryPassword}
                onChange={(e) => setNewTemporaryPassword(e.target.value)}
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                required
                disabled={creatingUser}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                placeholder="At least 8 characters"
              />
              <p className="text-xs text-muted-foreground">
                Share the temporary password securely. Do not send it in a
                public channel.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="newPosition" className="text-sm font-medium">
                Position
              </label>
              <input
                id="newPosition"
                type="text"
                value={newPosition}
                onChange={(e) => setNewPosition(e.target.value)}
                maxLength={150}
                disabled={creatingUser}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                placeholder="Enter position"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="newRole" className="text-sm font-medium">
                Role <span className="text-destructive">*</span>
              </label>
              <select
                id="newRole"
                value={newRole}
                onChange={(e) => handleNewRoleChange(e.target.value)}
                disabled={creatingUser}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              >
                {roles.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Default permissions for this role load automatically. You can
                customize them below.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="newRegion" className="text-sm font-medium">
                Region{' '}
                {newRole !== 'Admin' && (
                  <span className="text-destructive">*</span>
                )}
              </label>

              {newRole === 'Admin' ? (
                <div className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  All Regions
                </div>
              ) : (
                <select
                  id="newRegion"
                  value={newRegionId ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    setNewRegionId(value ? Number(value) : null)
                    setNewSubregionId(null)
                  }}
                  disabled={creatingUser}
                  required
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                >
                  <option value="">Select region</option>
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {newRole !== 'Admin' && (
              <div className="space-y-2">
                <label htmlFor="newSubregion" className="text-sm font-medium">
                  Subregion
                </label>
                <select
                  id="newSubregion"
                  value={newSubregionId ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    setNewSubregionId(value ? Number(value) : null)
                  }}
                  disabled={creatingUser || newRegionId === null}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">No subregion selected</option>
                  {availableNewSubregions.map((subregion) => (
                    <option key={subregion.id} value={subregion.id}>
                      {subregion.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Optional. Only subregions belonging to the selected region
                  are shown.
                </p>
              </div>
            )}
          </div>

          {/* Create User Permissions */}
          <div className="space-y-4 border-t p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-lg border p-2">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <h3 className="font-semibold">User Permissions</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure module access before creating the account.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => toggleAllNewPermissions(true)}
                disabled={creatingUser}
                className="self-start rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 sm:self-auto"
              >
                Enable All
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              Choose the actions this user can perform in each module.
              Unavailable actions are disabled by your authorization rules.
            </p>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[650px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-3 text-left font-medium">
                      Module
                    </th>
                    {permissionFields.map(({ field, label }) => (
                      <th
                        key={field}
                        className="px-4 py-3 text-center font-medium"
                      >
                        {label}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-center font-medium">
                      All
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {newPermissions.map((permission) => {
                    const availableFields = permissionFields.filter(
                      ({ field }) =>
                        !isPermissionDisabled(permission.module, field),
                    )

                    const allChecked =
                      availableFields.length > 0 &&
                      availableFields.every(
                        ({ field }) => permission[field],
                      )

                    return (
                      <tr
                        key={permission.module}
                        className="border-b last:border-0"
                      >
                        <td className="px-4 py-3 font-medium">
                          {permission.module}
                        </td>

                        {permissionFields.map(({ field, label }) => {
                          const disabled = isPermissionDisabled(
                            permission.module,
                            field,
                          )

                          return (
                            <td
                              key={field}
                              className="px-4 py-3 text-center"
                            >
                              <input
                                type="checkbox"
                                aria-label={`${label} permission for ${permission.module}`}
                                checked={permission[field]}
                                disabled={disabled || creatingUser}
                                title={
                                  disabled
                                    ? `${label} is not available for ${permission.module}`
                                    : `${label} ${permission.module}`
                                }
                                onChange={(e) =>
                                  updateNewPermission(
                                    permission.module,
                                    field,
                                    e.target.checked,
                                  )
                                }
                                className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-30"
                              />
                            </td>
                          )
                        })}

                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            aria-label={`All available permissions for ${permission.module}`}
                            checked={allChecked}
                            disabled={
                              creatingUser || availableFields.length === 0
                            }
                            onChange={(e) =>
                              toggleNewModulePermissions(
                                permission.module,
                                e.target.checked,
                              )
                            }
                            className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {newPermissions.filter((p) => p.can_view).length} of{' '}
                {modules.length} modules have View enabled.
              </p>
              <button
                type="button"
                onClick={() => toggleAllNewPermissions(false)}
                disabled={creatingUser}
                className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Clear All Permissions
              </button>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t px-6 py-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={resetCreateUserForm}
              disabled={creatingUser}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateUser}
              disabled={creatingUser}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {creatingUser && (
                <RefreshCw className="size-4 animate-spin" />
              )}
              {creatingUser ? 'Creating User...' : 'Create User'}
            </button>
          </div>
        </div>
      )}

      {/* Edit User */}
      {selectedUser && (
        <div className="space-y-6">
          <div className="rounded-xl border bg-background">
            <div className="border-b px-6 py-4">
              <h2 className="font-semibold">Edit User</h2>
              <p className="text-sm text-muted-foreground">
                Update the user's details, role, region, subregion, and status.
              </p>
            </div>

            <div className="grid gap-4 p-6 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="fullName" className="text-sm font-medium">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  disabled
                  className="w-full rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="position" className="text-sm font-medium">
                  Position
                </label>
                <input
                  id="position"
                  type="text"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="Enter position"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="role" className="text-sm font-medium">
                  Role
                </label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => handleRoleChange(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                >
                  {roles.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>

                {!hasSavedPermissions && (
                  <p className="text-xs text-muted-foreground">
                    Default permissions are applied for the selected role.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="region" className="text-sm font-medium">
                  Region
                </label>

                {role === 'Admin' ? (
                  <div className="w-full rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
                    All Regions
                  </div>
                ) : (
                  <select
                    id="region"
                    value={regionId ?? ''}
                    onChange={(e) => {
                      const value = e.target.value
                      const newId = value ? Number(value) : null

                      setRegionId(newId)

                      if (
                        subregionId !== null &&
                        !subregions.some(
                          (subregion) =>
                            subregion.id === subregionId &&
                            subregion.region_id === newId,
                        )
                      ) {
                        setSubregionId(null)
                      }
                    }}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select region</option>
                    {regions.map((region) => (
                      <option key={region.id} value={region.id}>
                        {region.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="subregion" className="text-sm font-medium">
                  Subregion
                </label>

                {role === 'Admin' ? (
                  <div className="w-full rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
                    All Subregions
                  </div>
                ) : (
                  <select
                    id="subregion"
                    value={subregionId ?? ''}
                    onChange={(e) => {
                      const value = e.target.value
                      setSubregionId(value ? Number(value) : null)
                    }}
                    disabled={regionId === null}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">No subregion selected</option>
                    {availableSubregions.map((subregion) => (
                      <option key={subregion.id} value={subregion.id}>
                        {subregion.name}
                      </option>
                    ))}
                  </select>
                )}

                <p className="text-xs text-muted-foreground">
                  Subregion is optional and must belong to the selected region.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  id="isActive"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="size-4"
                />
                <label htmlFor="isActive" className="text-sm font-medium">
                  Active
                </label>
              </div>
            </div>
          </div>

          {/* Edit User Permissions */}
          <div className="rounded-xl border bg-background">
            <div className="flex flex-col gap-3 border-b px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-lg border p-2">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <h2 className="font-semibold">User Permissions</h2>
                  <p className="text-sm text-muted-foreground">
                    Configure module access for{' '}
                    {selectedUser.full_name || selectedUser.email}.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => toggleAllPermissions(true)}
                disabled={loadingPermissions || permissionLoadError || saving}
                className="self-start rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 sm:self-auto"
              >
                Enable All
              </button>
            </div>

            <div className="space-y-4 p-6">
              <p className="text-sm text-muted-foreground">
                Select the actions this user can perform in each module.
                Disabled actions are not permitted for that module.
              </p>

              {permissionLoadError ? (
                <div className="rounded-lg border border-destructive/40 p-4 text-sm">
                  <p className="font-medium">
                    Permissions could not be loaded.
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Refresh the page or try again before saving changes.
                  </p>
                  <button
                    type="button"
                    onClick={() => loadUserPermissions(selectedUser.id, role)}
                    className="mt-3 rounded-md border px-3 py-2 hover:bg-muted"
                  >
                    Retry
                  </button>
                </div>
              ) : loadingPermissions ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Loading user permissions...
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[650px] text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="px-4 py-3 text-left font-medium">
                            Module
                          </th>
                          {permissionFields.map(({ field, label }) => (
                            <th
                              key={field}
                              className="px-4 py-3 text-center font-medium"
                            >
                              {label}
                            </th>
                          ))}
                          <th className="px-4 py-3 text-center font-medium">
                            All
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {permissions.map((permission) => {
                          const availableFields = permissionFields.filter(
                            ({ field }) =>
                              !isPermissionDisabled(permission.module, field),
                          )

                          const allChecked =
                            availableFields.length > 0 &&
                            availableFields.every(
                              ({ field }) => permission[field],
                            )

                          return (
                            <tr
                              key={permission.module}
                              className="border-b last:border-0"
                            >
                              <td className="px-4 py-3 font-medium">
                                {permission.module}
                              </td>

                              {permissionFields.map(({ field, label }) => {
                                const disabled = isPermissionDisabled(
                                  permission.module,
                                  field,
                                )

                                return (
                                  <td
                                    key={field}
                                    className="px-4 py-3 text-center"
                                  >
                                    <input
                                      type="checkbox"
                                      aria-label={`${label} permission for ${permission.module}`}
                                      checked={permission[field]}
                                      disabled={disabled || saving}
                                      title={
                                        disabled
                                          ? `${label} is not available for ${permission.module}`
                                          : `${label} ${permission.module}`
                                      }
                                      onChange={(e) =>
                                        updatePermission(
                                          permission.module,
                                          field,
                                          e.target.checked,
                                        )
                                      }
                                      className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-30"
                                    />
                                  </td>
                                )
                              })}

                              <td className="px-4 py-3 text-center">
                                <input
                                  type="checkbox"
                                  aria-label={`All available permissions for ${permission.module}`}
                                  checked={allChecked}
                                  disabled={
                                    saving || availableFields.length === 0
                                  }
                                  onChange={(e) =>
                                    toggleModulePermissions(
                                      permission.module,
                                      e.target.checked,
                                    )
                                  }
                                  className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {permissions.filter((p) => p.can_view).length} of{' '}
                      {modules.length} modules have View enabled.
                    </p>

                    <button
                      type="button"
                      onClick={() => toggleAllPermissions(false)}
                      disabled={saving}
                      className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                    >
                      Clear All Permissions
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Edit User Actions */}
          <div className="flex items-center justify-between rounded-xl border bg-background px-6 py-4">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="inline-flex items-center gap-2 rounded-md border border-destructive px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 className="size-4" />
              {deleting ? 'Deleting...' : 'Delete'}
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearSelection}
                disabled={saving || deleting}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving || loadingPermissions || permissionLoadError}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
