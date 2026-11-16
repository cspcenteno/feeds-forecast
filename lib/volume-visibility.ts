export function canReadAllVolumeRegions(role: string, position: string) {
  const salesPosition = position.trim().toUpperCase()
  return role === 'Admin'
    || (role === 'Manager' && salesPosition === 'NSM')
    || (role === 'Superuser' && !['SUPERVISOR', 'SV'].includes(salesPosition))
}
