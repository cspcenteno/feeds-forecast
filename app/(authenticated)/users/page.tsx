
'use client'

import { dashboardTypes, dashboardTypeLabels, dashboardTypeOrDefault, type DashboardType } from '@/lib/dashboard-settings'

import { sortRegions } from '@/lib/region-order'
import { permissionDefaultPreview } from '@/lib/permission-default-preview'
import { requiresUserSubregion, positionsForRole, positionForRole, validRolePosition } from '@/lib/users-import'

import { StatusBadge } from '@/components/ui/status-badge'

import { UserRoundCog as HeadingUserRoundCog, ShieldCheck as HeadingShieldCheck, Users as HeadingUsers } from 'lucide-react'

import { RefreshCw as ActionRefreshCwIcon } from 'lucide-react'

import { ActiveField } from '@/components/ui/active-field'
import { RecordDialog } from '@/components/ui/record-dialog'

import { useActionDialogs } from '@/components/action-dialogs'
import { SelectionField } from '@/components/ui/selection-field'
import { TableActionButton } from '@/components/ui/table-action-button'
import { Table } from '@/components/ui/table'
import { TableLoadingRow } from '@/components/ui/loading-spinner'
import { UsersExcelImport } from '@/components/users-excel-import'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  RefreshCw,
  Plus,
  Search,
  X,
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
  dashboard_type?: DashboardType
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
  | 'can_import'
  | 'can_export'
  | 'can_delete'

type ModulePermission = {
  module: ModuleName
  can_view: boolean
  can_add: boolean
  can_edit: boolean
  can_import: boolean
  can_export: boolean
  can_delete: boolean
}

const permissionFields: {
  field: PermissionField
  label: string
}[] = [
  { field: 'can_view', label: 'View' },
  { field: 'can_add', label: 'Add' },
  { field: 'can_edit', label: 'Edit' },
  { field: 'can_import', label: 'Import' },
  { field: 'can_export', label: 'Export' },
  { field: 'can_delete', label: 'Delete' },
]

function createDefaultPermissions(): ModulePermission[] {
  return modules.map((module) => ({
    module,
    can_view: false,
    can_add: false,
    can_edit: false,
    can_import: false,
    can_export: false,
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

  if (!normalized.can_view) { normalized.can_export = false; normalized.can_import = false }
  return normalized
}

function getDefaultPermissions(role: string, position = ''): ModulePermission[] {
  const shared = sharedDefaultPermissions(role, position)

  return modules.map((module) =>
    normalizePermission({
      module,
      can_view: shared[module].view,
      can_add: shared[module].add,
      can_edit: shared[module].edit,
      can_import: shared[module].import,
      can_export: shared[module].export,
      can_delete: shared[module].delete,
    }),
  )
}

export default function UsersPage() {
  const { confirmAction, notify } = useActionDialogs()

  const router = useRouter()
  const authorization = useAuthorization()
  const [supabase] = useState(() => createClient())

  const [users, setUsers] = useState<User[]>([])
  const [accountSearch, setAccountSearch] = useState('')
  const [regions, setRegions] = useState<Region[]>([])
  const [subregions, setSubregions] = useState<Subregion[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [resetTemporaryPassword, setResetTemporaryPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [userDialogOpen, setUserDialogOpen] = useState(false)

  // Edit User state
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [position, setPosition] = useState('')
  const [role, setRole] = useState<string>('User')
  const [regionId, setRegionId] = useState<number | null>(null)
  const [subregionId, setSubregionId] = useState<number | null>(null)
  const [isActive, setIsActive] = useState(false)
  const [dashboardType, setDashboardType] = useState<DashboardType>('system')

  // Create User state

  const [creatingUser, setCreatingUser] = useState(false)
  const [newFullName, setNewFullName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newTemporaryPassword, setNewTemporaryPassword] = useState('')
  const [newIsActive, setNewIsActive] = useState(true)
  const [newDashboardType, setNewDashboardType] = useState<DashboardType>('system')
  const [newRole, setNewRole] = useState<string>('User')
  const [newRegionId, setNewRegionId] = useState<number | null>(null)
  const [newSubregionId, setNewSubregionId] = useState<number | null>(null)
  const [newPosition, setNewPosition] = useState('KAM')
  const [updatingNewDefaults, setUpdatingNewDefaults] = useState(false)
  const [applyingRoleDefaults, setApplyingRoleDefaults] = useState(false)

  // Permissions for new and existing users
  const [newPermissions, setNewPermissions] = useState<ModulePermission[]>(
    () => getDefaultPermissions('User'),
  )

  const [permissions, setPermissions] = useState<ModulePermission[]>(
    () => createDefaultPermissions(),
  )

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
        .select('*')
        .order('id').limit(500)
      if (lastId !== null) query.gt('id', lastId)
      const { data, error } = await query.abortSignal(AbortSignal.timeout(45000))

      if (error) {
        console.error('Users Select Error:', error)
        notify(`Unable to load users: ${error.message}`)
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
      notify(`Unable to load regions: ${error.message}`)
      return
    }

    setRegions(sortRegions((data ?? []) as Region[]))
  }

  async function loadSubregions() {
    const { data, error } = await supabase
      .from('subregions')
      .select('id, name, region_id')
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (error) {
      console.error('Subregions Select Error:', error)
      notify(`Unable to load subregions: ${error.message}`)
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
        await loadUserPermissions(selectedUser.id)
      }
    } finally {
      setRefreshing(false)
    }
  }

  async function loadUserPermissions(userId: string) {
    setLoadingPermissions(true)
    setPermissionLoadError(false)

    const { data, error } = await supabase
      .from('user_permissions')
      .select(`
        module,
        can_view,
        can_add,
        can_edit,
        can_import,
        can_export,
        can_delete,
        is_default
      `)
      .eq('user_id', userId)

    if (error) {
      console.error('User Permissions Select Error:', error)
      setPermissionLoadError(true)
      setLoadingPermissions(false)
      notify(`Unable to load user permissions: ${error.message}`)
      return
    }

    if (!data?.length) {
      setPermissions(getDefaultPermissions(''))
      setLoadingPermissions(false)
      return
    }

    const savedPermissions = new Map(
      data.map((item) => [item.module, item]),
    )

    const mergedPermissions: ModulePermission[] = modules.map(
      (module) => {
        const saved = savedPermissions.get(module)

        return normalizePermission(saved ? {
          module,
          can_view: saved.can_view,
          can_add: saved.can_add,
          can_edit: saved.can_edit,
          can_import: saved.can_import,
          can_export: saved.can_export,
          can_delete: saved.can_delete,
        } : {
          module,
          can_view: false,
          can_add: false,
          can_edit: false,
          can_import: false,
          can_export: false,
          can_delete: false,
        })
      },
    )

    setPermissions(mergedPermissions)
    setLoadingPermissions(false)
  }

  async function selectUser(user: User) {
    setUserDialogOpen(true)
    setResetTemporaryPassword('')

    setSelectedUser(user)
    setFullName(user.full_name ?? '')
    setEmail(user.email)
    setPosition(positionForRole(user.role, user.position ?? ''))
    setRole(user.role)
    setRegionId(user.position === 'NSM' ? null : user.region_id)
    setSubregionId(user.position === 'NSM' ? null : user.subregion_id)
    setIsActive(user.is_active)
    setDashboardType(dashboardTypeOrDefault(user.dashboard_type))

    await loadUserPermissions(user.id)
  }

  function handleRoleChange(newRole: string) {
    setRole(newRole)
    setPosition(positionForRole(newRole, position))

    if (newRole === 'Admin' || positionForRole(newRole, position) === 'NSM') {
      setRegionId(null)
      setSubregionId(null)
    }
  }

  function handlePositionChange(nextPosition: string) {
    setPosition(nextPosition)
    if (nextPosition === 'NSM') {
      setRegionId(null)
      setSubregionId(null)
    }
  }

  function clearSelection() {
    setUserDialogOpen(false)
    setResetTemporaryPassword('')

    setSelectedUser(null)
    setFullName('')
    setEmail('')
    setPosition('')
    setRole('User')
    setRegionId(null)
    setSubregionId(null)
    setIsActive(false)
    setDashboardType('system')
    setPermissions(createDefaultPermissions())
    setLoadingPermissions(false)
    setPermissionLoadError(false)
  }

  function resetCreateUserForm() {

    setNewFullName('')
    setNewEmail('')
    setNewTemporaryPassword('')
    setNewIsActive(true)
    setNewDashboardType('system')
    setNewRole('User')
    setNewRegionId(null)
    setNewSubregionId(null)
    setNewPosition('KAM')
    setNewPermissions(getDefaultPermissions('User'))
  }

  function openCreateUserForm() {
    clearSelection()
    resetCreateUserForm()
    setUserDialogOpen(true)
  }

  async function changeNewUserDefaults(nextRole: string, nextPosition: string) {
    if (updatingNewDefaults || (nextRole === newRole && nextPosition === newPosition)) return
    const defaults = getDefaultPermissions(nextRole, nextPosition)
    const customized = JSON.stringify(newPermissions) !== JSON.stringify(getDefaultPermissions(newRole, newPosition))
    const replacing = JSON.stringify(newPermissions) !== JSON.stringify(defaults)
    let ticket: Awaited<ReturnType<typeof confirmAction>> = null
    setUpdatingNewDefaults(true)
    try {
      if (customized && replacing) {
        ticket = await confirmAction({
          title: 'Replace customized permissions?',
          message: 'Changing the role or sales position will replace your customized checkboxes with the defaults for the new selection.',
          confirmLabel: 'Replace permissions',
        })
        if (!ticket) return
      }
      setNewRole(nextRole)
      setNewPosition(nextPosition)
      setNewPermissions(defaults)
      if (nextRole === 'Admin' || nextPosition === 'NSM') {
        setNewRegionId(null)
        setNewSubregionId(null)
      }
    } finally {
      ticket?.finish()
      setUpdatingNewDefaults(false)
    }
  }

  function handleNewRoleChange(nextRole: string) {
    void changeNewUserDefaults(nextRole, positionForRole(nextRole, newPosition))
  }

  function handleNewPositionChange(nextPosition: string) {
    void changeNewUserDefaults(newRole, nextPosition)
  }

  async function applyExistingRoleDefaults() {
    if (!selectedUser || applyingRoleDefaults || loadingPermissions || permissionLoadError || !authorization.can('Users', 'edit')) return
    const defaults = getDefaultPermissions(role, position)
    const changes = permissionDefaultPreview(permissions, defaults)

    if (!changes.length) {
      notify('Permission checkboxes already match the role defaults.', { success: true })
      return
    }
    let ticket: Awaited<ReturnType<typeof confirmAction>> = null
    setApplyingRoleDefaults(true)
    try {
      ticket = await confirmAction({
        title: 'Apply role defaults?',
        message: 'Replace this user’s permission checkboxes with the selected role and sales position defaults? Review the changes below. They take effect only after you save the user.',
        confirmLabel: 'Apply defaults',
        tone: 'caution',
        details: [{ label: 'User', value: fullName }, { label: 'Role / Position', value: [role, position].filter(Boolean).join(' / ') }, ...changes],
      })
      if (ticket) setPermissions(defaults)
    } finally {
      ticket?.finish()
      setApplyingRoleDefaults(false)
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
              ...((field === 'can_export' || field === 'can_import') && checked ? { can_view: true } : {}),
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
              ...((field === 'can_export' || field === 'can_import') && checked ? { can_view: true } : {}),
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
      notify('Please enter the full name.')
      return
    }

    if (!newEmail.trim()) {
      notify('Please enter the email address.')
      return
    }

    if (newTemporaryPassword.length < 8 || newTemporaryPassword.length > 128) {
      notify('The temporary password must be between 8 and 128 characters.')
      return
    }

    if (!roles.includes(newRole as (typeof roles)[number])) {
      notify('Please select a valid role.')
      return
    }
    if (!validRolePosition(newRole, newPosition)) {
      notify('Please select a sales position allowed for this role.')
      return
    }

    if (newRole !== 'Admin' && newPosition !== 'NSM' && newRegionId === null) {
      notify('Please select a region.')
      return
    }
    if (requiresUserSubregion(newRole, newPosition) && newSubregionId === null) {
      notify('Please select a subregion for this KAM or RSM account.')
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
      notify('Please select a subregion belonging to the selected region.')
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
          dashboardType: newDashboardType,
          role: newRole,
          regionId: newRole === 'Admin' ? null : newRegionId,
          subregionId: newRole === 'Admin' ? null : newSubregionId,
          position: newPosition.trim(),
          permissions: normalizedNewPermissions.map((permission) => ({
            module: permission.module,
            can_view: permission.can_view,
            can_add: permission.can_add,
            can_edit: permission.can_edit,
            can_import: permission.can_import,
            can_export: permission.can_export,
            can_delete: permission.can_delete,
          })),
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        notify(result.error || 'Unable to create the user.')
        return
      }

      await loadUsers()
      resetCreateUserForm()
      setUserDialogOpen(false)

      notify('User created successfully. Share the temporary password securely. The user must change it after signing in.')
    } catch (error) {
      console.error('Create User Error:', error)
      notify('Unable to connect to the server. Please try again.')
    } finally {
      setCreatingUser(false)
    }
  }


  // Save both profile details and permissions through the server API.
  async function handleSave() {
    if (!selectedUser) return

    if (!fullName.trim()) {
      notify('Please enter the full name.')
      return
    }

    if (fullName.trim().length > 150) {
      notify('Full name must not exceed 150 characters.')
      return
    }

    if (position.trim().length > 150) {
      notify('Position must not exceed 150 characters.')
      return
    }

    if (!roles.includes(role as (typeof roles)[number])) {
      notify('Please select a valid role.')
      return
    }
    if (!validRolePosition(role, position)) {
      notify('Please select a sales position allowed for this role.')
      return
    }

    if (role !== 'Admin' && position !== 'NSM' && regionId === null) {
      notify('Please select a region.')
      return
    }
    if (requiresUserSubregion(role, position) && subregionId === null) {
      notify('Please select a subregion for this KAM or RSM account.')
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
      notify('Please select a subregion belonging to the selected region.')
      return
    }

    if (loadingPermissions || permissionLoadError) {
      notify('Please ensure user permissions have loaded successfully before saving.')
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
          dashboardType,
          permissions: normalizedPermissions.map((permission) => ({
            module: permission.module,
            can_view: permission.can_view,
            can_add: permission.can_add,
            can_edit: permission.can_edit,
            can_import: permission.can_import,
            can_export: permission.can_export,
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
          setDashboardType(dashboardTypeOrDefault(updatedUser.dashboard_type))
        }

        notify(result.error || 'Unable to save changes.')
        return
      }

      if (!result.user) {
        notify('The server did not return the updated user record.')
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
      setDashboardType(dashboardTypeOrDefault(updatedUser.dashboard_type))

      setPermissions(normalizedPermissions)
      setPermissionLoadError(false)

      notify('User details and permissions saved successfully.')
      setUserDialogOpen(false)
    } catch (error) {
      console.error('Save User Error:', error)

      notify(error instanceof Error
          ? `Unable to save changes: ${error.message}`
          : 'Unable to save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }


  async function handleDelete(targetUser: User) {
    let actionConfirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
    if (deleting || !authorization.can('Users', 'delete')) return

    const confirmed = (actionConfirmation = await confirmAction({
      title: 'Delete this user?', confirmLabel: 'Delete User', tone: 'danger',
      message: 'This permanently deletes the user account and sign-in access.',
      details: [{ label: 'User', value: targetUser.full_name || targetUser.email }, { label: 'Email', value: targetUser.email }],
    }))

    if (!confirmed) return

    setDeleting(true)

    try {
      const response = await fetch('/api/admin/users', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUser.id }),
      })
      const result = await response.json()
      if (!response.ok) {
        notify(result.error || 'Unable to delete the account.')
        await loadUsers()
        return
      }

      setUsers((currentUsers) =>
        currentUsers.filter((user) => user.id !== targetUser.id),
      )

      if (selectedUser?.id === targetUser.id) clearSelection()
    } catch {
      notify('Unable to delete the account. Please try again.')
    } finally {
      setDeleting(false)
    }

    } finally { actionConfirmation?.finish() }
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
  async function handleResetPassword() {
    if (!selectedUser || resettingPassword || !authorization.can('Users', 'edit')) return
    if (resetTemporaryPassword.length < 8 || resetTemporaryPassword.length > 128) {
      notify('The temporary password must be between 8 and 128 characters.')
      return
    }
    setResettingPassword(true)
    let confirmation: Awaited<ReturnType<typeof confirmAction>> = null
    try {
      confirmation = await confirmAction({ title: 'Reset this user’s password?', confirmLabel: 'Reset Password', tone: 'caution',
        message: 'Replace the current password with the temporary password entered. The user must change it after signing in.',
        details: [{ label: 'User', value: selectedUser.full_name || selectedUser.email }, { label: 'Email', value: selectedUser.email }] })
      if (!confirmation) return
      const response = await fetch('/api/admin/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser.id, temporaryPassword: resetTemporaryPassword }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to reset the password.')
      setResetTemporaryPassword('')
      notify('Password reset successfully. Share the temporary password securely. The user must change it after signing in.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to reset the password.')
    } finally {
      confirmation?.finish()
      setResettingPassword(false)
    }
  }

  const formBusy = loading || deleting || importBusy || resettingPassword || updatingNewDefaults || applyingRoleDefaults || (selectedUser ? saving : creatingUser)
  const permissionsBusy = formBusy || Boolean(selectedUser && (loadingPermissions || permissionLoadError))
  const formPermissions = selectedUser ? permissions : newPermissions
  const allFormPermissionsEnabled = formPermissions.every((permission) =>
    permissionFields.every(({ field }) =>
      isPermissionDisabled(permission.module, field) || permission[field]
    )
  )
  const someFormPermissionsEnabled = formPermissions.some((permission) =>
    permissionFields.some(({ field }) => !isPermissionDisabled(permission.module, field) && permission[field]))
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

  const accountSearchTerms = accountSearch.trim().toLocaleLowerCase('en-PH').split(/\s+/).filter(Boolean)
  const visibleUsers = sortedUsers.filter((user) => accountSearchTerms.every((term) =>
    (user.full_name ?? '').toLocaleLowerCase('en-PH').includes(term)
      || (user.email ?? '').toLocaleLowerCase('en-PH').includes(term)
  ))

  if (!isAdmin && !loading) return null

  return (
    <div className="space-y-4">
      {isAdmin && authorization.can('Users', 'add') && authorization.can('Users', 'import') && <UsersExcelImport
        blocked={loading || saving || deleting || creatingUser || refreshing || resettingPassword}
        onBusyChange={setImportBusy}
        onCreated={loadUsers}
      />}
      {/* User form */}
      {isAdmin && (selectedUser || authorization.can('Users', 'add')) && (
        <RecordDialog open={userDialogOpen} onClose={() => { clearSelection(); resetCreateUserForm() }} title={selectedUser ? 'Edit User' : 'Create User'} busy={formBusy} wide>
        <div id="user-editor" className="min-w-0">
          <div data-section-header="" className="flex flex-col gap-3 border-b px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 data-section-title="" className="font-semibold"><HeadingUserRoundCog className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />{selectedUser ? 'Edit User' : 'Create User'}</h2>

            </div>

          </div>

          <div className="app-field-row p-6">
            <div data-field-size="wide" className="space-y-2">
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

            <div data-field-size="wide" className="space-y-2">
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
                placeholder="Enter email address"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="newTemporaryPassword" className="text-sm font-medium">
                Temporary Password
              </label>
              <input
                id="newTemporaryPassword"
                type="password"
                value={selectedUser ? resetTemporaryPassword : newTemporaryPassword}
                onChange={(event) => (selectedUser ? setResetTemporaryPassword : setNewTemporaryPassword)(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required={!selectedUser}
                disabled={formBusy || (Boolean(selectedUser) && !authorization.can('Users', 'edit'))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                placeholder={selectedUser ? 'Enter a new temporary password' : 'At least 8 characters'}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="newRole" className="text-sm font-medium">
                Role <span className="text-destructive">*</span>
              </label>
              <SelectionField id="newRole"
                  value={formRole}
                  onValueChange={(selectionValue) => (selectedUser ? handleRoleChange : handleNewRoleChange)(selectionValue)}
                  disabled={formBusy}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                  aria-label="Role *">
                {roles.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </SelectionField>
            </div>

            <div className="space-y-2">
              <label htmlFor="newPosition" className="text-sm font-medium">
                Sales Position
              </label>
              <SelectionField id="newPosition"
                  value={selectedUser ? position : newPosition}
                  onValueChange={(selectionValue) => (selectedUser ? handlePositionChange : handleNewPositionChange)(selectionValue)}
                  disabled={formBusy || positionsForRole(formRole).length <= 1}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                  aria-label="Sales Position">
                <option value="">{formRole === 'Admin' ? 'Not applicable' : 'Select a sales position'}</option>
                {positionsForRole(formRole).map((option) => <option key={option} value={option}>{option}</option>)}
              </SelectionField>
            </div>

            <div className="space-y-2">
              <label htmlFor="newRegion" className="text-sm font-medium">
                Region{' '}
                {formRole !== 'Admin' && (selectedUser ? position : newPosition) !== 'NSM' && (
                  <span className="text-destructive">*</span>
                )}
              </label>

              {formRole === 'Admin' || (selectedUser ? position : newPosition) === 'NSM' ? (
                <SelectionField id="newRegion"
                  value=""
                  disabled
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none disabled:opacity-50"
                  aria-label="Selection">
                  <option value="">No region selected</option>
                </SelectionField>
              ) : (
                <SelectionField id="newRegion"
                  value={formRegionId ?? ''}
                  onValueChange={(selectionValue) => {
                    const value = selectionValue
                    setFormRegionId(value ? Number(value) : null)
                    setFormSubregionId(null)
                  }}
                  disabled={formBusy}
                  required={(selectedUser ? position : newPosition) !== 'NSM'}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                  aria-label="Selection">
                  <option value="">Select region</option>
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name}
                    </option>
                  ))}
                </SelectionField>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="newSubregion" className="text-sm font-medium">
                {requiresUserSubregion(formRole, selectedUser ? position : newPosition)
                  ? <>Subregion <span className="text-destructive">*</span></>
                  : 'Subregion (Optional)'}
              </label>
              {formRole === 'Admin' || (selectedUser ? position : newPosition) === 'NSM' ? (
                <SelectionField id="newSubregion"
                  value=""
                  disabled
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none disabled:opacity-50"
                  aria-label="Selection">
                  <option value="">No subregion selected</option>
                </SelectionField>
              ) : (
                <SelectionField id="newSubregion"
                  value={(selectedUser ? subregionId : newSubregionId) ?? ''}
                  required={requiresUserSubregion(formRole, selectedUser ? position : newPosition)}
                  onValueChange={(selectionValue) => {
                    const value = selectionValue
                    setFormSubregionId(value ? Number(value) : null)
                  }}
                  disabled={formBusy || formRegionId === null}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Selection">
                  <option value="">No subregion selected</option>
                  {formSubregions.map((subregion) => (
                    <option key={subregion.id} value={subregion.id}>
                      {subregion.name}
                    </option>
                  ))}
                </SelectionField>
              )}
            </div>
            <div data-user-dashboard-fields className="flex items-start gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <label htmlFor="userDashboardType" className="text-sm font-medium">Dashboard Type</label>
              <SelectionField id="userDashboardType"
                value={selectedUser ? dashboardType : newDashboardType}
                onValueChange={(value) => (selectedUser ? setDashboardType : setNewDashboardType)(dashboardTypeOrDefault(value))}
                disabled={formBusy} aria-label="Dashboard Type" className="w-full">
                {dashboardTypes.map((type) => <option key={type} value={type}>{dashboardTypeLabels[type]}</option>)}
              </SelectionField>
              </div>
            <ActiveField
                checked={selectedUser ? isActive : newIsActive}
                onChange={(event) => (selectedUser ? setIsActive : setNewIsActive)(event.target.checked)}
                disabled={formBusy}
              />
            </div>
          </div>

          {/* Create User Permissions */}
          <div data-user-permissions className="flex flex-col gap-3 border-t px-4 pt-4 pb-2 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 data-section-title="" className="font-semibold"><HeadingShieldCheck className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />User Permissions</h3>

              </div>

              <div data-action-toolbar="" data-permissions-toolbar="" className="flex flex-wrap gap-2">
                {selectedUser && authorization.can('Users', 'edit') && <button
                  type="button" data-action-tone="neutral" onClick={() => void applyExistingRoleDefaults()}
                  disabled={permissionsBusy} className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50">
                  <ActionRefreshCwIcon className="size-4 shrink-0" aria-hidden="true" />
                  Apply role defaults
                </button>}

              </div>
            </div>

            <div id="user-editor-permissions" className="space-y-4">
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
                    onClick={() => selectedUser && loadUserPermissions(selectedUser.id)}
                    className="mt-3 rounded-md border px-3 py-2 hover:bg-muted"
                  ><ActionRefreshCwIcon className="mr-1.5 inline-block size-4 shrink-0 align-middle" aria-hidden="true" />
                    Retry
                  </button>
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
                          <label className="inline-flex cursor-pointer items-center justify-center gap-2">
                            <input type="checkbox" aria-label="All available permissions across all modules"
                              checked={allFormPermissionsEnabled}
                              aria-checked={someFormPermissionsEnabled && !allFormPermissionsEnabled ? 'mixed' : allFormPermissionsEnabled}
                              ref={(input) => { if (input) input.indeterminate = someFormPermissionsEnabled && !allFormPermissionsEnabled }}
                              disabled={permissionsBusy}
                              onChange={(event) => toggleFormPermissions(event.target.checked)}
                              className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50" />
                            All
                          </label>
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {loadingPermissions ? <TableLoadingRow columns={permissionFields.length + 2} label="user permissions" /> : formPermissions.map((permission) => {
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

          <div data-action-toolbar="" className="flex flex-wrap items-center gap-2 border-t bg-muted/20 px-6 py-4">
            <button type="button" data-action-tone="neutral" disabled={formBusy} onClick={() => { clearSelection(); resetCreateUserForm() }} className="inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm"><X className="size-4" aria-hidden="true" />Cancel</button>
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
            {selectedUser && authorization.can('Users', 'edit') && (
              <button type="button" data-action-tone="caution" onClick={handleResetPassword}
                disabled={formBusy || resetTemporaryPassword.length < 8}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium">
                {resettingPassword && <RefreshCw className="size-4 animate-spin" aria-hidden="true" />}
                {resettingPassword ? 'Resetting…' : 'Reset Password'}
              </button>
            )}
          </div>
        </div>
        </RecordDialog>
      )}

      {/* User Accounts */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div data-section-header="" className="flex flex-col gap-3 border-b px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 data-section-title="" className="font-semibold"><HeadingUsers className="mr-2 inline-block size-5 shrink-0 align-middle text-muted-foreground" aria-hidden="true" />User Accounts</h2>

          </div>

          <div data-action-toolbar="" className="flex flex-wrap items-center gap-2">
            <label className="relative w-full sm:w-64">
              <span className="sr-only">Search user accounts by name or email</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input type="search" value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)}
                placeholder="Search name or email…" autoComplete="off"
                className="h-10 w-full rounded-md border bg-background pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </label>
            {isAdmin && authorization.can('Users', 'add') && <button data-action-tone="primary" data-action-fill=""
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
              disabled={loading || refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw
                className={`size-4 ${refreshing ? 'animate-spin' : ''}`}
              />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        <Table summary={{ records: visibleUsers.length }} saved
          containerProps={{ tabIndex: 0, role: "region", "aria-label": "User Accounts table", 'aria-busy': loading || refreshing }}
        >
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b bg-muted/40">
                {(authorization.can('Users', 'add') || authorization.can('Users', 'edit') || authorization.can('Users', 'delete')) && <th data-action-column="standard" className="whitespace-nowrap px-4 py-3 text-left font-medium">Action</th>}
                <th data-fixed-column="status" className="px-4 py-3 text-left font-medium">Status</th>
                <SortableHeader plain className="px-6 py-3 text-left font-medium" {...sortHeader('name')}>Full Name</SortableHeader>
                <SortableHeader plain className="px-4 py-3 text-left font-medium" {...sortHeader('email')}>Email</SortableHeader>
                <SortableHeader plain className="px-4 py-3 text-left font-medium" {...sortHeader('role')}>Role</SortableHeader>
                <SortableHeader plain className="px-4 py-3 text-left font-medium" {...sortHeader('position')}>Sales Position</SortableHeader>
                <SortableHeader plain className="px-4 py-3 text-left font-medium" {...sortHeader('region')}>Region</SortableHeader>
                <SortableHeader plain className="px-4 py-3 text-left font-medium" {...sortHeader('subregion')}>Subregion</SortableHeader>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <TableLoadingRow columns={authorization.can('Users', 'add') || authorization.can('Users', 'edit') || authorization.can('Users', 'delete') ? 8 : 7} label="user accounts" />
              ) : visibleUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={authorization.can('Users', 'add') || authorization.can('Users', 'edit') || authorization.can('Users', 'delete') ? 8 : 7}
                    className="px-6 py-8 text-center text-muted-foreground"
                  >
                    {accountSearchTerms.length ? 'No users match your search.' : 'No users to display.'}
                  </td>
                </tr>
              ) : (
                visibleUsers.map((user) => (
                  <tr
                    key={user.id}
                    className={`border-b last:border-0 ${
                      selectedUser?.id === user.id ? 'bg-muted/40' : ''
                    }`}
                  >
                    {(authorization.can('Users', 'add') || authorization.can('Users', 'edit') || authorization.can('Users', 'delete')) && <td data-action-column="standard" className="px-4 py-3">
                      <div className="flex items-center gap-2">
                      {authorization.can('Users', 'edit') && (
                      <TableActionButton action="edit" data-action-tone="caution"
                        type="button"
                        onClick={() => selectUser(user)}
                        disabled={formBusy || loadingPermissions}
                        className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                       />
                      )}
                      {authorization.can('Users', 'delete') && <TableActionButton action="delete"
                        onClick={() => handleDelete(user)} disabled={formBusy || loadingPermissions}
                        aria-label={`Delete ${user.full_name || user.email}`}
                      />}
                      {!authorization.can('Users', 'edit') && !authorization.can('Users', 'delete') && <span className="text-sm text-muted-foreground">No Action</span>}
                      </div>
                    </td>}
                    <td className="px-4 py-3"><StatusBadge status={user.is_active ? 'Active' : 'Pending'} /></td>
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
