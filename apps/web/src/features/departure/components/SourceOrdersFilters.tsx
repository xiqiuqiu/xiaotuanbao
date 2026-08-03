import type { ReactNode } from 'react'
import { Button, Card, Input, Select, Space } from 'antd'
import type { SourceOrderFilterDraft } from '../utils/source-order-filter-state'
import { SOURCE_ORDER_COLLECTION_OPTIONS } from '../catalog'

interface SourceOrdersFiltersProps {
  draft: SourceOrderFilterDraft
  partnerOptions: Array<{ value: string; label: string }>
  onDraftChange: (draft: SourceOrderFilterDraft) => void
  onApply: () => void
  onReset: () => void
  extra?: ReactNode
  /** Optional settlement glance rendered inside the same card below filters. */
  summary?: ReactNode
}

export function SourceOrdersFilters({
  draft,
  partnerOptions,
  onDraftChange,
  onApply,
  onReset,
  extra,
  summary,
}: SourceOrdersFiltersProps) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          <Select
            allowClear
            aria-label="客户"
            placeholder="全部客户"
            style={{ width: 180 }}
            showSearch={{ optionFilterProp: 'label' }}
            value={draft.partnerId}
            onChange={(value) => onDraftChange({ ...draft, partnerId: value })}
            options={partnerOptions}
          />
          <Select
            allowClear
            aria-label="收款方式"
            placeholder="全部收款方式"
            style={{ width: 180 }}
            value={draft.collectionMode}
            onChange={(value) => onDraftChange({ ...draft, collectionMode: value })}
            options={[...SOURCE_ORDER_COLLECTION_OPTIONS]}
          />
          <Select
            allowClear
            aria-label="优惠状态"
            placeholder="全部优惠状态"
            style={{ width: 140 }}
            value={draft.hasDiscount}
            onChange={(value) => onDraftChange({ ...draft, hasDiscount: value })}
            options={[
              { value: 'all', label: '全部' },
              { value: 'yes', label: '有优惠' },
              { value: 'no', label: '无优惠' },
            ]}
          />
          <Input
            allowClear
            aria-label="搜索客户名称、备注"
            placeholder="客户名称或备注"
            style={{ width: 220 }}
            value={draft.keyword}
            onChange={(event) => onDraftChange({ ...draft, keyword: event.target.value })}
            onPressEnter={onApply}
          />
          <Button autoInsertSpace={false} onClick={onApply}>
            查询
          </Button>
          <Button autoInsertSpace={false} onClick={onReset}>
            重置
          </Button>
        </Space>
        {extra}
      </Space>
      {summary ?? null}
    </Card>
  )
}
