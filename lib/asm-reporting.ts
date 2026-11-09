export type AsmUser = { id: string; full_name: string | null; region_id: number | null }

export function asmForRegion(regionId: number | null, users: AsmUser[]) {
  const matches = users.filter((user) => regionId !== null && user.region_id === regionId)
  return matches.length === 1 ? { asm_id: matches[0].id, asm_name: matches[0].full_name || 'Name unavailable' }
    : { asm_id: null, asm_name: matches.length > 1 ? 'Multiple ASMs assigned' : 'Unassigned ASM' }
}
