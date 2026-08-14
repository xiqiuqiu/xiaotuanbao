import type { DepartureMaterialView } from '@xiaotuanbao/shared'

const IN_FLIGHT = new Set(['uploaded', 'queued', 'parsing'])
const CONSUMABLE = new Set(['available', 'partially_available'])

export function openedMaterialIds(materials: DepartureMaterialView[] | undefined): Set<string> {
  return new Set((materials ?? []).map((material) => material.id))
}

export function windowMaterialConsume(options: {
  materials?: DepartureMaterialView[]
  openedMaterialIds: ReadonlySet<string>
}): { pending: boolean; key: string | null } {
  const windowMaterials = (options.materials ?? []).filter(
    (material) => !options.openedMaterialIds.has(material.id),
  )
  if (windowMaterials.length === 0) {
    return { pending: false, key: null }
  }
  if (windowMaterials.some((material) => IN_FLIGHT.has(material.status))) {
    return { pending: false, key: null }
  }
  const ready = windowMaterials.filter((material) => CONSUMABLE.has(material.status))
  if (ready.length === 0) {
    return { pending: false, key: null }
  }
  return {
    pending: true,
    key: ready.map((material) => `${material.id}:${material.latestResultVersion ?? 0}`).join(','),
  }
}
