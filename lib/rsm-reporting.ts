export type RsmUser = { id: string; full_name: string | null; region_id: number | null; subregion_id: number | null }

export const rsmAssignmentKey = (region: number | null, subregion: number | null) => `${region}:${subregion}`

export function rsmForSubregion(region: number | null, subregion: number | null, users: RsmUser[]) {
  const matches = users.filter(user => region !== null && subregion !== null && user.region_id === region && user.subregion_id === subregion)
  return matches.length === 1 ? matches[0].full_name?.trim() || 'Name unavailable'
    : matches.length > 1 ? 'Multiple RSMs assigned' : 'Unassigned RSM'
}
