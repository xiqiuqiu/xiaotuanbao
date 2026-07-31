import { useMemo, useState } from 'react'
import { App, Select } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ResourceKind } from '@xiaotuanbao/shared'
import type { SupplierSummary } from '@/types/api'
import { useAuthStore } from '@/app/store/auth.store'
import { canEditSupplier } from '@/features/supplier/utils/supplier-permission'
import {
  SUPPLIER_QUICK_CREATE_OPTION_VALUE,
  createOrResolveSupplierByName,
  duplicateSupplierWarningMessage,
  formatSupplierQuickCreateOptionLabel,
  resolveDuplicateSupplierSelection,
  shouldShowSupplierQuickCreateOption,
} from '../utils/supplier-quick-create'

export interface SupplierQuickCreateSelectProps {
  category: ResourceKind
  value?: string
  onChange?: (value: string | undefined) => void
  suppliers: readonly Pick<SupplierSummary, 'id' | 'name' | 'categories' | 'status'>[]
  /** Keep a currently selected supplier visible even if not in the filtered list. */
  pinnedOption?: { id: string; name: string } | null
  searchValue: string
  onSearch: (value: string) => void
  loading?: boolean
  disabled?: boolean
  allowClear?: boolean
  placeholder?: string
  /** Shown when there is no match and quick-create is unavailable. */
  emptyHint?: string
  /** Server-side search: disable client option filtering. */
  filterOption?: false | { optionFilterProp?: string }
  id?: string
}

/**
 * Supplier Select with inline「创建“…”」when the user has `supplier:write`.
 * Form.Item can wrap this directly; create sentinel never leaks into the field value.
 */
export function SupplierQuickCreateSelect({
  category,
  value,
  onChange,
  suppliers,
  pinnedOption,
  searchValue,
  onSearch,
  loading = false,
  disabled = false,
  allowClear = true,
  placeholder,
  emptyHint = '暂无匹配供应商',
  filterOption = false,
  id,
}: SupplierQuickCreateSelectProps) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const canWriteSupplier = canEditSupplier(useAuthStore((state) => state.actionKeys) ?? [])
  const [createdOption, setCreatedOption] = useState<{ id: string; name: string } | null>(null)

  const options = useMemo(() => {
    const byId = new Map<string, { value: string; label: string }>()
    for (const supplier of suppliers) {
      byId.set(supplier.id, { value: supplier.id, label: supplier.name })
    }
    if (pinnedOption) {
      byId.set(pinnedOption.id, { value: pinnedOption.id, label: pinnedOption.name })
    }
    if (createdOption) {
      byId.set(createdOption.id, { value: createdOption.id, label: createdOption.name })
    }

    const next = [...byId.values()]
    if (
      shouldShowSupplierQuickCreateOption({
        canWriteSupplier,
        categoryReady: true,
        searchText: searchValue,
        suppliers: next.map((item) => ({ name: item.label })),
      })
    ) {
      const name = searchValue.trim()
      next.push({
        value: SUPPLIER_QUICK_CREATE_OPTION_VALUE,
        label: formatSupplierQuickCreateOptionLabel(name),
      })
    }
    return next
  }, [canWriteSupplier, createdOption, pinnedOption, searchValue, suppliers])

  const selectSupplier = (supplier: Pick<SupplierSummary, 'id' | 'name'>) => {
    setCreatedOption({ id: supplier.id, name: supplier.name })
    onSearch('')
    onChange?.(supplier.id)
  }

  const applyExisting = (supplier: SupplierSummary) => {
    const resolved = resolveDuplicateSupplierSelection({
      supplier,
      resourceKind: category,
    })
    if (!resolved.ok) {
      message.warning(duplicateSupplierWarningMessage(resolved.reason))
      return
    }
    selectSupplier(supplier)
    message.info('供应商已存在，已自动选中')
  }

  const quickCreateMutation = useMutation({
    mutationFn: (name: string) =>
      createOrResolveSupplierByName({
        name,
        category,
        localCandidates: [
          ...suppliers,
          ...(pinnedOption ? [pinnedOption] : []),
          ...(createdOption ? [createdOption] : []),
        ],
        resolveLocal: (id) =>
          suppliers.find((item) => item.id === id) as SupplierSummary | undefined,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      if (result.kind === 'created') {
        selectSupplier(result.supplier)
        message.success('供应商已创建')
        return
      }
      applyExisting(result.supplier)
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '创建供应商失败')
    },
  })

  const showSearch =
    filterOption === false
      ? { filterOption: false as const, onSearch }
      : {
          optionFilterProp: filterOption.optionFilterProp ?? 'label',
          onSearch,
        }

  return (
    <Select
      id={id}
      allowClear={allowClear}
      showSearch={showSearch}
      searchValue={searchValue}
      value={value}
      loading={loading || quickCreateMutation.isPending}
      disabled={disabled || quickCreateMutation.isPending}
      placeholder={placeholder}
      options={options}
      notFoundContent={
        canWriteSupplier && searchValue.trim()
          ? undefined
          : emptyHint
      }
      onChange={(next) => {
        if (next === SUPPLIER_QUICK_CREATE_OPTION_VALUE) {
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
