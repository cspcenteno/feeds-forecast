export function canReadAllVolumeRegions(role: string, position: string) {
  const salesPosition = position.trim().toUpperCase()
  return role === 'Admin'
    || (role === 'Manager' && salesPosition === 'NSM')
    || (role === 'Superuser' && !['SUPERVISOR', 'SV'].includes(salesPosition))
}
export function requiresVolumeSubregion(role: string, position: string) {
  return role !== 'Admin' && ['RSM', 'KAM'].includes(position.trim().toUpperCase())
}
