
'use client'

import { Table } from '@/components/ui/table'
import { UsersExcelImport } from '@/components/users-excel-import'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Pencil,
  Trash2,
  RefreshCw,
  Plus,
} from 'lucide-react'

import { SortableHeader, useTableSort } from '@/components/ui/sortable-header'
import { createClient } from '@/lib/client'
import {
  defaultPermissions as sharedDefaultPermissions,
  disabledPermissions,
  modules,
  useAuthorization,
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
  const authorization = useAuthorization()
  const [supabase] = useState(() => createClient())

  const [users, setUsers] = useState<User[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [subregions, setSubregions] = useState<Subregion[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
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
  const [showUserPermissions, setShowUserPermissions] = useState(false)
  const [creatingUser, setCreatingUser] = useState(false)
  const [newFullName, setNewFullName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newTemporaryPassword, setNewTemporaryPassword] = useState('#vita2026')
  const [newIsActive, setNewIsActive] = useState(true)
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
  const [permissionsDirty, setPermissionsDirty] = useState(false)
  const [loadingPermissions, setLoadingPermissions] = useState(false)
  const [permissionLoadError, setPermissionLoadError] = useState(false)

  useEffect(() => {
    checkAccess()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedUser) document.getElementById('user-editor')?.scrollIntoView({ block: 'start' })
  }, [selectedUser])

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
    const allUsers: User[] = []
    let lastId: string | null = null
    while (true) {
      const query = supabase
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
        .order('id').limit(500)
      if (lastId !== null) query.gt('id', lastId)
      const { data, error } = await query.abortSignal(AbortSignal.timeout(45000))

      if (error) {
        console.error('Users Select Error:', error)
        alert(`Unable to load users: ${error.message}`)
        return
      }

      const page = (data ?? []) as User[]
      allUsers.push(...page)
      if (page.length < 500) break
      lastId = page[page.length - 1].id
    }
    setUsers(allUsers.sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '')))
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

    if (!data?.length) {
      setHasSavedPermissions(false)
      setPermissionsDirty(false)
      setPermissions(getDefaultPermissions(selectedRole))
      setLoadingPermissions(false)
      return
    }

    const roleDefaults = getDefaultPermissions(selectedRole)
    const savedPermissions = new Map(
      data.map((item) => [item.module, item]),
    )

    const mergedPermissions: ModulePermission[] = modules.map(
      (module) => {
        const saved = savedPermissions.get(module)
        const fallback = roleDefaults.find((permission) => permission.module === module)

        return normalizePermission(saved ? {
          module,
          can_view: saved.can_view,
          can_add: saved.can_add,
          can_edit: saved.can_edit,
          can_delete: saved.can_delete,
        } : {
          module,
          can_view: fallback?.can_view ?? false,
          can_add: fallback?.can_add ?? false,
          can_edit: fallback?.can_edit ?? false,
          can_delete: fallback?.can_delete ?? false,
        })
      },
    )

    setHasSavedPermissions(data.some((item) => !item.is_default))
    setPermissionsDirty(false)
    setPermissions(mergedPermissions)
    setLoadingPermissions(false)
  }

  async function selectUser(user: User) {
    setShowUserPermissions(false)
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

    if (!hasSavedPermissions && !permissionsDirty) {
      setPermissions(getDefaultPermissions(newRole))
    }

    if (newRole === 'Admin') {
      setRegionId(null)
      setSubregionId(null)
    }
  }

  function clearSelection() {
    setShowUserPermissions(false)
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
    setPermissionsDirty(false)
    setLoadingPermissions(false)
    setPermissionLoadError(false)
  }

  function resetCreateUserForm() {
    setShowUserPermissions(false)
    setNewFullName('')
    setNewEmail('')
    setNewTemporaryPassword('#vita2026')
    setNewIsActive(true)
    setNewRole('User')
    setNewRegionId(null)
    setNewSubregionId(null)
    setNewPosition('')
    setNewPermissions(getDefaultPermissions('User'))
  }

  function openCreateUserForm() {
    if (selectedUser) {
      clearSelection()
      resetCreateUserForm()
    }
    document.getElementById('user-editor')?.scrollIntoView({ block: 'start' })
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
    setPermissionsDirty(true)

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
    setPermissionsDirty(true)
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
    setPermissionsDirty(true)
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

    if (newTemporaryPassword.length < 8 || newTemporaryPassword.length > 128) {
      alert('The temporary password must be between 8 and 128 characters.')
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
          isActive: newIsActive,
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
      setPermissionsDirty(false)
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
    if (id === null) return '—'

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

  const formRole = selectedUser ? role : newRole
  const formRegionId = selectedUser ? regionId : newRegionId
  const formSubregions = selectedUser ? availableSubregions : availableNewSubregions
  const setFormRegionId = selectedUser ? setRegionId : setNewRegionId
  const setFormSubregionId = selectedUser ? setSubregionId : setNewSubregionId
  const formBusy = importBusy || (selectedUser ? saving || deleting : creatingUser)
  const permissionsBusy = formBusy || Boolean(selectedUser && (loadingPermissions || permissionLoadError))
  const formPermissions = selectedUser ? permissions : newPermissions
  const allFormPermissionsEnabled = formPermissions.every((permission) =>
    permissionFields.every(({ field }) =>
      isPermissionDisabled(permission.module, field) || permission[field]
    )
  )
  const updateFormPermission = selectedUser ? updatePermission : updateNewPermission
  const toggleFormModulePermissions = selectedUser ? toggleModulePermissions : toggleNewModulePermissions
  const toggleFormPermissions = selectedUser ? toggleAllPermissions : toggleAllNewPermissions

  const { sortedRows: sortedUsers, sortHeader } = useTableSort(users, {
    name: (row) => row.full_name,
    email: (row) => row.email,
    role: (row) => row.role,
    position: (row) => row.position,
    region: (row) => getRegionName(row.region_id),
    subregion: (row) => getSubregionName(row.subregion_id),
  })

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
      {authorization.can('Users', 'add') && <UsersExcelImport
        blocked={saving || deleting || creatingUser || refreshing}
        onBusyChange={setImportBusy}
        onCreated={loadUsers}
      />}
      {/* User form */}
      {(selectedUser || authorization.can('Users', 'add')) && (
        <div id="user-editor" className="scroll-mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">{selectedUser ? 'Edit User' : 'Create User'}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedUser ? 'Update the account and its permissions.' : 'Create an account and assign its initial role and permissions.'}
              </p>
            </div>

          </div>

          <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <label htmlFor="newFullName" className="text-sm font-medium">
                Full Name <span className="text-destructive">*</span>
              </label>
              <input
                id="newFullName"
                type="text"
                value={selectedUser ? fullName : newFullName}
                onChange={(e) => (selectedUser ? setFullName : setNewFullName)(e.target.value)}
                maxLength={150}
                autoComplete="name"
                required
                disabled={formBusy}
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
                value={selectedUser ? email : newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                maxLength={254}
                autoComplete="off"
                required
                disabled={formBusy || Boolean(selectedUser)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                placeholder="user@company.com"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="newTemporaryPassword" className="text-sm font-medium">
                Temporary Password
              </label>
              <input
                id="newTemporaryPassword"
                type="password"
                value={selectedUser ? '' : newTemporaryPassword}
                onChange={(event) => setNewTemporaryPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required={!selectedUser}
                disabled={formBusy || Boolean(selectedUser)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                placeholder={selectedUser ? 'Set when creating the account' : 'At least 8 characters'}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="newRole" className="text-sm font-medium">
                Role <span className="text-destructive">*</span>
              </label>
              <select
                id="newRole"
                value={formRole}
                onChange={(e) => (selectedUser ? handleRoleChange : handleNewRoleChange)(e.target.value)}
                disabled={formBusy}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              >
                {roles.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="newPosition" className="text-sm font-medium">
                Sales Position
              </label>
              <select
                id="newPosition"
                value={selectedUser ? position : newPosition}
                onChange={(e) => (selectedUser ? setPosition : setNewPosition)(e.target.value)}
                disabled={formBusy || formRole === 'Admin'}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              >
                <option value="">Select a sales position</option>
                <option value="KAM">KAM</option>
                <option value="RSM">RSM</option>
                <option value="ASM">ASM</option>
                <option value="Supervisor">Supervisor</option>
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="newRegion" className="text-sm font-medium">
                Region{' '}
                {formRole !== 'Admin' && (
                  <span className="text-destructive">*</span>
                )}
              </label>

              {formRole === 'Admin' ? (
                <select
                  id="newRegion"
                  value=""
                  disabled
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none disabled:opacity-50"
                >
                  <option value="">No region selected</option>
                </select>
              ) : (
                <select
                  id="newRegion"
                  value={formRegionId ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    setFormRegionId(value ? Number(value) : null)
                    setFormSubregionId(null)
                  }}
                  disabled={formBusy}
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

            <div className="space-y-2">
              <label htmlFor="newSubregion" className="text-sm font-medium">
                Subregion (Optional)
              </label>
              {formRole === 'Admin' ? (
                <select
                  id="newSubregion"
                  value=""
                  disabled
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none disabled:opacity-50"
                >
                  <option value="">No subregion selected</option>
                </select>
              ) : (
                <select
                  id="newSubregion"
                  value={(selectedUser ? subregionId : newSubregionId) ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    setFormSubregionId(value ? Number(value) : null)
                  }}
                  disabled={formBusy || formRegionId === null}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">No subregion selected</option>
                  {formSubregions.map((subregion) => (
                    <option key={subregion.id} value={subregion.id}>
                      {subregion.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={selectedUser ? isActive : newIsActive}
                onChange={(event) => (selectedUser ? setIsActive : setNewIsActive)(event.target.checked)}
                disabled={formBusy}
                className="size-4"
              />
              Active
            </label>
          </div>

          {/* Create User Permissions */}
          <div className="flex flex-col gap-3 border-t px-6 pt-4 pb-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold">User Permissions</h3>
                <p className="text-sm text-muted-foreground">
                  {selectedUser ? 'Configure module access for this account.' : 'Configure module access before creating the account.'}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button data-action-tone="neutral"
                  type="button"
                  aria-expanded={showUserPermissions}
                  aria-controls="user-editor-permissions"
                  onClick={() => setShowUserPermissions((visible) => !visible)}
                  className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  {showUserPermissions ? 'Hide Permissions' : 'Show Permissions'}
                </button>
                {showUserPermissions && (
                  <button
                    type="button"
                    data-action-tone={allFormPermissionsEnabled ? 'caution' : 'positive'}
                    onClick={() => toggleFormPermissions(!allFormPermissionsEnabled)}
                    disabled={permissionsBusy}
                    className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    {allFormPermissionsEnabled ? 'Disable All' : 'Enable All'}
                  </button>
                )}
              </div>
            </div>

            <div id="user-editor-permissions" hidden={!showUserPermissions} className="space-y-4">
              {permissionLoadError ? (
                <div className="rounded-lg border border-destructive/40 p-4 text-sm">
                  <p className="font-medium">
                    Permissions could not be loaded.
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Refresh the page or try again before saving changes.
                  </p>
                  <button data-action-tone="neutral"
                    type="button"
                    onClick={() => selectedUser && loadUserPermissions(selectedUser.id, role)}
                    className="mt-3 rounded-md border px-3 py-2 hover:bg-muted"
                  >
                    Retry
                  </button>
                </div>
              ) : loadingPermissions ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Loading user permissions...
                </div>
              ) : (<>
                <Table
                  className="min-w-[650px]"
                  containerProps={{ className: "max-h-[min(16rem,45vh)] overflow-auto rounded-lg border", tabIndex: 0, role: "region", "aria-label": "User permissions" }}
                >
                    <thead className="sticky top-0 z-10 bg-background">
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
                      {formPermissions.map((permission) => {
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
                                    disabled={disabled || permissionsBusy}
                                    title={
                                      disabled
                                        ? `${label} is not available for ${permission.module}`
                                        : `${label} ${permission.module}`
                                    }
                                    onChange={(e) =>
                                      updateFormPermission(
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
                                  permissionsBusy || availableFields.length === 0
                                }
                                onChange={(e) =>
                                  toggleFormModulePermissions(
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
                </Table>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {formPermissions.filter((p) => p.can_view).length} of{' '}
                    {modules.length} modules have View enabled.
                  </p>
                </div>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t bg-muted/20 px-6 py-4">
            <button data-action-tone="primary" data-action-fill=""
              type="button"
              onClick={selectedUser ? handleSave : handleCreateUser}
              disabled={permissionsBusy}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {formBusy && (
                <RefreshCw className="size-4 animate-spin" />
              )}
              {selectedUser ? (saving ? 'Saving...' : 'Save Changes') : (creatingUser ? 'Creating User...' : 'Create User')}
            </button>
            {selectedUser && authorization.can('Users', 'delete') && (
              <button data-action-tone="danger"
                type="button"
                onClick={handleDelete}
                disabled={formBusy}
                className="inline-flex items-center gap-2 rounded-md border border-destructive px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <Trash2 className="size-4" />
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* User Accounts */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">User Accounts</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {users.length} user{users.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {selectedUser && authorization.can('Users', 'add') && <button data-action-tone="primary" data-action-fill=""
              type="button"
              onClick={openCreateUserForm}
              disabled={formBusy || loadingPermissions}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="size-4" />
              Create User
            </button>}

            <button data-action-tone="neutral"
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

        <Table saved
          containerProps={{ tabIndex: 0, role: "region", "aria-label": "User Accounts table" }}
        >
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b bg-muted/40">
                {(authorization.can('Users', 'add') || authorization.can('Users', 'edit') || authorization.can('Users', 'delete')) && <th className="whitespace-nowrap px-4 py-3 text-left font-medium">Action</th>}
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <SortableHeader plain className="px-6 py-3 text-left font-medium" {...sortHeader('name')}>Full Name</SortableHeader>
                <SortableHeader plain className="px-4 py-3 text-left font-medium" {...sortHeader('email')}>Email</SortableHeader>
                <SortableHeader plain className="px-4 py-3 text-left font-medium" {...sortHeader('role')}>Role</SortableHeader>
                <SortableHeader plain className="px-4 py-3 text-left font-medium" {...sortHeader('position')}>Sales Position</SortableHeader>
                <SortableHeader plain className="px-4 py-3 text-left font-medium" {...sortHeader('region')}>Region</SortableHeader>
                <SortableHeader plain className="px-4 py-3 text-left font-medium" {...sortHeader('subregion')}>Subregion</SortableHeader>
              </tr>
            </thead>

            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td
                    colSpan={authorization.can('Users', 'add') || authorization.can('Users', 'edit') || authorization.can('Users', 'delete') ? 8 : 7}
                    className="px-6 py-8 text-center text-muted-foreground"
                  >
                    No users found.
                  </td>
                </tr>
              ) : (
                sortedUsers.map((user) => (
                  <tr
                    key={user.id}
                    className={`border-b last:border-0 ${
                      selectedUser?.id === user.id ? 'bg-muted/40' : ''
                    }`}
                  >
                    {(authorization.can('Users', 'add') || authorization.can('Users', 'edit') || authorization.can('Users', 'delete')) && <td className="px-4 py-3">
                      {authorization.can('Users', 'edit') ? (
                      <button data-action-tone="caution"
                        type="button"
                        onClick={() => selectUser(user)}
                        disabled={formBusy || loadingPermissions}
                        className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                      >
                        <Pencil className="size-4" />
                        Edit
                      </button>
                      ) : <span className="text-sm text-muted-foreground">No Action</span>}
                    </td>}
                    <td className="px-4 py-3">{user.is_active ? 'Active' : 'Pending'}</td>
                    <td className="px-6 py-3">{user.full_name || '—'}</td>
                    <td className="px-4 py-3">{user.email}</td>
                    <td className="px-4 py-3">{user.role}</td>
                    <td className="px-4 py-3">{user.position || '—'}</td>
                    <td className="px-4 py-3">
                      {getRegionName(user.region_id)}
                    </td>
                    <td className="px-4 py-3">
                      {getSubregionName(user.subregion_id)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
        </Table>
      </div>

    </div>
  )
}
