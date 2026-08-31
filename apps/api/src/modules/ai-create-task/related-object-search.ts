import {
  SEARCH_RELATED_OBJECTS_LIMIT,
  type RelatedObjectMatchReason,
  type SearchPartnerItem,
  type SearchSupplierItem,
  type SearchUserItem,
} from '@xiaotuanbao/ai-contracts'

export interface RelatedObjectSearchRecord {
  id: string
  name: string
  status: 'enabled' | 'disabled'
}

export interface UserSearchRecord extends RelatedObjectSearchRecord {}

export interface SupplierSearchRecord extends RelatedObjectSearchRecord {
  categories: string[]
}

export interface PartnerSearchRecord extends RelatedObjectSearchRecord {
  partnerKind: string
}

function tokenize(keyword: string | undefined): string[] {
  return (keyword ?? '')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
}

function containsToken(haystack: string, token: string): boolean {
  return haystack.toLowerCase().includes(token.toLowerCase())
}

function reasonsForName(name: string, tokens: string[]): RelatedObjectMatchReason[] | null {
  const reasons: RelatedObjectMatchReason[] = []
  for (const token of tokens) {
    if (!containsToken(name, token)) {
      return null
    }
    reasons.push({ code: 'name_contains_token', token })
  }
  return reasons
}

function compareByNameThenId(
  left: RelatedObjectSearchRecord,
  right: RelatedObjectSearchRecord,
): number {
  const nameDiff = left.name.localeCompare(right.name, 'zh-CN')
  if (nameDiff !== 0) return nameDiff
  if (left.id < right.id) return -1
  if (left.id > right.id) return 1
  return 0
}

export function searchUsersForAgent(
  users: readonly UserSearchRecord[],
  query: { keyword?: string },
): SearchUserItem[] {
  const tokens = tokenize(query.keyword)
  if (tokens.length === 0) return []

  return [...users]
    .filter((user) => user.status === 'enabled')
    .flatMap((user) => {
      const matchReasons = reasonsForName(user.name, tokens)
      if (!matchReasons) return []
      return [{ kind: 'user' as const, id: user.id, name: user.name, status: user.status, matchReasons }]
    })
    .sort(compareByNameThenId)
    .slice(0, SEARCH_RELATED_OBJECTS_LIMIT)
}

export function searchSuppliersForAgent(
  suppliers: readonly SupplierSearchRecord[],
  query: { keyword?: string; category?: string },
): SearchSupplierItem[] {
  const tokens = tokenize(query.keyword)
  if (tokens.length === 0) return []
  const category = query.category?.trim()

  return [...suppliers]
    .filter((supplier) => supplier.status === 'enabled')
    .filter((supplier) => (category ? supplier.categories.includes(category) : true))
    .flatMap((supplier) => {
      const matchReasons = reasonsForName(supplier.name, tokens)
      if (!matchReasons) return []
      return [
        {
          kind: 'supplier' as const,
          id: supplier.id,
          name: supplier.name,
          status: supplier.status,
          categories: [...supplier.categories],
          matchReasons,
        },
      ]
    })
    .sort(compareByNameThenId)
    .slice(0, SEARCH_RELATED_OBJECTS_LIMIT)
}

export function searchPartnersForAgent(
  partners: readonly PartnerSearchRecord[],
  query: { keyword?: string },
): SearchPartnerItem[] {
  const tokens = tokenize(query.keyword)
  if (tokens.length === 0) return []

  return [...partners]
    .filter((partner) => partner.status === 'enabled')
    .flatMap((partner) => {
      const matchReasons = reasonsForName(partner.name, tokens)
      if (!matchReasons) return []
      return [
        {
          kind: 'partner' as const,
          id: partner.id,
          name: partner.name,
          status: partner.status,
          partnerKind: partner.partnerKind,
          matchReasons,
        },
      ]
    })
    .sort(compareByNameThenId)
    .slice(0, SEARCH_RELATED_OBJECTS_LIMIT)
}
