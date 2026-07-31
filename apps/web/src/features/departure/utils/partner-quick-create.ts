import { DirectoryProfileStatus, PartnerKind, PartnerType } from '@xiaotuanbao/shared'
import type { PartnerSummary } from '@/types/api'
import { ApiError } from '@/lib/request'
import { createPartner, getPartner, listPartners } from '@/services/partner.service'

/** Sentinel Select value for inline「创建“…”」— never persisted as partnerId. */
export const PARTNER_QUICK_CREATE_OPTION_VALUE = '__create_partner__'

/** 客源单快捷建档默认：合作伙伴类型=组团社，合作方向=客户方。 */
export const SOURCE_ORDER_PARTNER_QUICK_CREATE_DEFAULTS = {
  partnerType: PartnerType.GROUP_AGENCY,
  partnerKind: PartnerKind.GROUP_AGENT,
} as const

export function formatPartnerQuickCreateOptionLabel(name: string): string {
  return `创建“${name.trim()}”`
}

export function findPartnerByExactName(
  partners: readonly Pick<PartnerSummary, 'id' | 'name'>[],
  name: string,
): Pick<PartnerSummary, 'id' | 'name'> | undefined {
  const trimmed = name.trim()
  if (!trimmed) {
    return undefined
  }
  return partners.find((item) => item.name === trimmed)
}

export function shouldShowPartnerQuickCreateOption(input: {
  canWritePartner: boolean
  searchText: string
  partners: readonly Pick<PartnerSummary, 'name'>[]
}): boolean {
  const trimmed = input.searchText.trim()
  if (!input.canWritePartner || !trimmed) {
    return false
  }
  return !input.partners.some((item) => item.name === trimmed)
}

export function resolveDuplicatePartnerSelection(input: {
  partner: Pick<PartnerSummary, 'id' | 'name' | 'status'>
}): { ok: true; partnerId: string } | { ok: false; reason: 'not_active' } {
  if (input.partner.status !== DirectoryProfileStatus.ACTIVE) {
    return { ok: false, reason: 'not_active' }
  }
  return { ok: true, partnerId: input.partner.id }
}

export function duplicatePartnerWarningMessage(): string {
  return '同名合作伙伴不可用（已停用或已归档），请到合作伙伴管理处理或改用其他名称'
}

export async function createOrResolvePartnerByName(input: {
  name: string
  partnerType?: PartnerType
  partnerKind?: PartnerKind
  localCandidates?: readonly Pick<PartnerSummary, 'id' | 'name'>[]
  resolveLocal?: (
    id: string,
  ) => PartnerSummary | undefined | Promise<PartnerSummary | undefined>
}): Promise<{ kind: 'created' | 'existing'; partner: PartnerSummary }> {
  const trimmed = input.name.trim()
  if (!trimmed) {
    throw new Error('请输入合作伙伴名称')
  }

  const localMatch = findPartnerByExactName(input.localCandidates ?? [], trimmed)
  if (localMatch) {
    const resolved = input.resolveLocal ? await input.resolveLocal(localMatch.id) : undefined
    if (resolved) {
      return { kind: 'existing', partner: resolved }
    }
    const fetched = await getPartner(localMatch.id)
    return { kind: 'existing', partner: fetched }
  }

  try {
    const created = await createPartner(
      {
        name: trimmed,
        partnerType: input.partnerType ?? SOURCE_ORDER_PARTNER_QUICK_CREATE_DEFAULTS.partnerType,
        partnerKind: input.partnerKind ?? SOURCE_ORDER_PARTNER_QUICK_CREATE_DEFAULTS.partnerKind,
      },
      { silentError: true },
    )
    return { kind: 'created', partner: created }
  } catch (error) {
    if (!(error instanceof ApiError) || error.message !== '合作伙伴名称已存在') {
      throw error
    }

    const listed = await listPartners({
      search: trimmed,
      includeArchived: true,
      pageSize: 100,
    })
    const existing = findPartnerByExactName(listed.items, trimmed)
    if (!existing) {
      throw error
    }
    const full =
      listed.items.find((item) => item.id === existing.id) ?? (await getPartner(existing.id))
    return { kind: 'existing', partner: full }
  }
}
