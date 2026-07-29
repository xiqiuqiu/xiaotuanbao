import {
  decodeDepartureListReturn,
  parseDepartureListSearch,
  type DepartureListSearch,
} from './departure-list-search'

export type DepartureDetailBackAction =
  | { type: 'departure-list'; search: DepartureListSearch }
  | { type: 'history-back' }

/**
 * Decide where the departure-detail back control should go.
 * Explicit listReturn / list location.state → restore 发团管理 filters.
 * Otherwise → router history (the real jump source: workbench, finance, …).
 */
export function resolveDepartureDetailBackAction(
  locationState: unknown,
  listReturnParam?: unknown,
): DepartureDetailBackAction {
  const fromUrl = decodeDepartureListReturn(listReturnParam)
  if (fromUrl !== undefined) {
    return { type: 'departure-list', search: fromUrl }
  }

  if (locationState && typeof locationState === 'object') {
    const listSearch = (locationState as { listSearch?: unknown }).listSearch
    if (listSearch && typeof listSearch === 'object') {
      return {
        type: 'departure-list',
        search: parseDepartureListSearch(listSearch as Record<string, unknown>),
      }
    }
  }

  return { type: 'history-back' }
}
