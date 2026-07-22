export type ProductListSearch = {
  importSessionId?: string
  sourceSheetName?: string
}

export function parseProductListSearch(search: Record<string, unknown>): ProductListSearch {
  return {
    importSessionId:
      typeof search.importSessionId === 'string' && search.importSessionId.trim()
        ? search.importSessionId.trim()
        : undefined,
    sourceSheetName:
      typeof search.sourceSheetName === 'string' && search.sourceSheetName.trim()
        ? search.sourceSheetName.trim()
        : undefined,
  }
}
