type NestedGroup = { count: number; groups: ReadonlyMap<string, NestedGroup> }

export function groupedTableKeys(groups: ReadonlyMap<string, NestedGroup>, parent: string[] = []): string[] {
  const keys: string[] = []
  for (const [key, group] of groups) {
    if (group.count === 0) continue
    const path = [...parent, key]
    keys.push(JSON.stringify(path), ...groupedTableKeys(group.groups, path))
  }
  return keys
}
