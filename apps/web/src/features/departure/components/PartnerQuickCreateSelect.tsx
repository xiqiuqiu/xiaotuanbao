import { useMemo, useState } from 'react'
import { App, Select } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { PartnerKind, PartnerType } from '@xiaotuanbao/shared'
import type { PartnerSummary } from '@/types/api'
import { useAuthStore } from '@/app/store/auth.store'
import { canEditPartner } from '@/features/partner/utils/partner-permission'
import {
  PARTNER_QUICK_CREATE_OPTION_VALUE,
  SOURCE_ORDER_PARTNER_QUICK_CREATE_DEFAULTS,
  createOrResolvePartnerByName,
  duplicatePartnerWarningMessage,
  formatPartnerQuickCreateOptionLabel,
  resolveDuplicatePartnerSelection,
  shouldShowPartnerQuickCreateOption,
} from '../utils/partner-quick-create'

export interface PartnerQuickCreateSelectProps {
  value?: string
  onChange?: (value: string | undefined) => void
  partners: readonly Pick<PartnerSummary, 'id' | 'name' | 'status'>[]
  pinnedOption?: { id: string; name: string } | null
  searchValue: string
  onSearch: (value: string) => void
  loading?: boolean
  disabled?: boolean
  allowClear?: boolean
  placeholder?: string
  emptyHint?: string
  partnerType?: PartnerType
  partnerKind?: PartnerKind
  id?: string
}

/**
 * Partner Select with inline「创建“…”」when the user has `partner:write`.
 * 客源单默认：组团社 + 客户方。
 */
export function PartnerQuickCreateSelect({
  value,
  onChange,
  partners,
  pinnedOption,
  searchValue,
  onSearch,
  loading = false,
  disabled = false,
  allowClear = false,
  placeholder = '选择合作伙伴',
  emptyHint = '暂无匹配合作伙伴',
  partnerType = SOURCE_ORDER_PARTNER_QUICK_CREATE_DEFAULTS.partnerType,
  partnerKind = SOURCE_ORDER_PARTNER_QUICK_CREATE_DEFAULTS.partnerKind,
  id,
}: PartnerQuickCreateSelectProps) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const canWritePartner = canEditPartner(useAuthStore((state) => state.actionKeys) ?? [])
  const [createdOption, setCreatedOption] = useState<{ id: string; name: string } | null>(null)

  const options = useMemo(() => {
    const byId = new Map<string, { value: string; label: string }>()
    for (const partner of partners) {
      byId.set(partner.id, { value: partner.id, label: partner.name })
    }
    if (pinnedOption) {
      byId.set(pinnedOption.id, { value: pinnedOption.id, label: pinnedOption.name })
    }
    if (createdOption) {
      byId.set(createdOption.id, { value: createdOption.id, label: createdOption.name })
    }

    const next = [...byId.values()]
    if (
      shouldShowPartnerQuickCreateOption({
        canWritePartner,
        searchText: searchValue,
        partners: next.map((item) => ({ name: item.label })),
      })
    ) {
      next.push({
        value: PARTNER_QUICK_CREATE_OPTION_VALUE,
        label: formatPartnerQuickCreateOptionLabel(searchValue),
      })
    }
    return next
  }, [canWritePartner, createdOption, partners, pinnedOption, searchValue])

  const selectPartner = (partner: Pick<PartnerSummary, 'id' | 'name'>) => {
    setCreatedOption({ id: partner.id, name: partner.name })
    onSearch('')
    onChange?.(partner.id)
  }

  const applyExisting = (partner: PartnerSummary) => {
    const resolved = resolveDuplicatePartnerSelection({ partner })
    if (!resolved.ok) {
      message.warning(duplicatePartnerWarningMessage())
      return
    }
    selectPartner(partner)
    message.info('合作伙伴已存在，已自动选中')
  }

  const quickCreateMutation = useMutation({
    mutationFn: (name: string) =>
      createOrResolvePartnerByName({
        name,
        partnerType,
        partnerKind,
        localCandidates: [
          ...partners,
          ...(pinnedOption ? [pinnedOption] : []),
          ...(createdOption ? [createdOption] : []),
        ],
        resolveLocal: (id) =>
          partners.find((item) => item.id === id) as PartnerSummary | undefined,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['partners'] })
      if (result.kind === 'created') {
        selectPartner(result.partner)
        message.success('合作伙伴已创建')
        return
      }
      applyExisting(result.partner)
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '创建合作伙伴失败')
    },
  })

  return (
    <Select
      id={id}
      allowClear={allowClear}
      showSearch={{ optionFilterProp: 'label', onSearch }}
      searchValue={searchValue}
      value={value}
      loading={loading || quickCreateMutation.isPending}
      disabled={disabled || quickCreateMutation.isPending}
      placeholder={placeholder}
      options={options}
      notFoundContent={canWritePartner && searchValue.trim() ? undefined : emptyHint}
      onChange={(next) => {
        if (next === PARTNER_QUICK_CREATE_OPTION_VALUE) {
          const name = searchValue.trim()
          if (name && !quickCreateMutation.isPending) {
            quickCreateMutation.mutate(name)
          }
          return
        }
        onChange?.(next ?? undefined)
        onSearch('')
      }}
    />
  )
}
