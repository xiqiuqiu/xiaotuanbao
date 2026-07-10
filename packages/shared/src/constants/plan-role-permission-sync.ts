/**
 * Diff current RolePermission menu keys against the desired preset.
 * Seed uses this for bidirectional sync (add missing, delete extras).
 */
export function planRolePermissionSync(
  currentKeys: readonly string[],
  desiredKeys: readonly string[],
): { toAdd: string[]; toRemove: string[] } {
  const current = new Set(currentKeys)
  const desired = new Set(desiredKeys)

  const toAdd = desiredKeys.filter((key) => !current.has(key))
  const toRemove = currentKeys.filter((key) => !desired.has(key))

  return { toAdd, toRemove }
}
