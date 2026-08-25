export const PAGE_LOCATOR_UNSUPPORTED = 'PAGE_LOCATOR_UNSUPPORTED'

export const PAGE_LOCATOR_KINDS = ['partner', 'departure'] as const
export const PAGE_LOCATOR_SECTIONS = ['accounts', 'overview'] as const

export type PageLocatorKind = (typeof PAGE_LOCATOR_KINDS)[number]
export type PageLocatorSection = (typeof PAGE_LOCATOR_SECTIONS)[number]

export interface PageLocator {
  kind: PageLocatorKind
  objectId: string
  section?: PageLocatorSection
}

const KIND_SET = new Set<string>(PAGE_LOCATOR_KINDS)
const SECTION_SET = new Set<string>(PAGE_LOCATOR_SECTIONS)
const OBJECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseObjectId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const objectId = value.trim()
  return OBJECT_ID_PATTERN.test(objectId) ? objectId : null
}

function parseSection(value: unknown): PageLocatorSection | null | undefined {
  if (value == null) {
    return undefined
  }
  return typeof value === 'string' && SECTION_SET.has(value)
    ? (value as PageLocatorSection)
    : null
}

export function parsePageLocator(value: unknown): PageLocator | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }
  if (typeof record.kind !== 'string' || !KIND_SET.has(record.kind)) {
    return null
  }
  const objectId = parseObjectId(record.objectId)
  if (!objectId) {
    return null
  }
  const section = parseSection(record.section)
  if (section === null) {
    return null
  }
  return section
    ? { kind: record.kind as PageLocatorKind, objectId, section }
    : { kind: record.kind as PageLocatorKind, objectId }
}

function firstPathSegmentAfter(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(`${prefix}/`)) {
    return null
  }
  const rest = pathname.slice(prefix.length + 1)
  const [segment, extra] = rest.split('/')
  if (!segment || extra) {
    return null
  }
  return parseObjectId(segment)
}

function searchParam(search: string | undefined, key: string): string | undefined {
  if (!search) {
    return undefined
  }
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  return params.get(key) ?? undefined
}

export function parsePageLocatorFromLocation(
  pathname: string,
  search?: string,
): PageLocator | null {
  if (pathname === '/departure/new' || pathname.startsWith('/agent/')) {
    return null
  }
  const partnerId = firstPathSegmentAfter(pathname, '/partner')
  if (partnerId) {
    return parsePageLocator({
      kind: 'partner',
      objectId: partnerId,
      section: parseSection(searchParam(search, 'tab')) ?? undefined,
    })
  }
  const departureId = firstPathSegmentAfter(pathname, '/departure')
  if (departureId) {
    return parsePageLocator({
      kind: 'departure',
      objectId: departureId,
      section: parseSection(searchParam(search, 'tab')) ?? undefined,
    })
  }
  return null
}

export function pageLocatorLabel(locator: PageLocator): string {
  if (locator.kind === 'partner') {
    return locator.section === 'accounts' ? '当前合作伙伴往来账款' : '当前合作伙伴'
  }
  return locator.section === 'overview' ? '当前发团概览' : '当前发团'
}
