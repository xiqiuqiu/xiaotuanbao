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
}

export function SourceOrdersFilters({
  draft,
  partnerOptions,
  onDraftChange,
  onApply,
  onReset,
  extra,
}: SourceOrdersFiltersProps) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <Space wrap>
          <Select
            allowClear
            placeholder="客户"
            style={{ width: 180 }}
            showSearch
            optionFilterProp="label"
            value={draft.partnerId}
            onChange={(value) => onDraftChange({ ...draft, partnerId: value })}
            options={partnerOptions}
          />
          <Select
            allowClear
            placeholder="收款方式"
            style={{ width: 180 }}
            value={draft.collectionMode}
            onChange={(value) => onDraftChange({ ...draft, collectionMode: value })}
            options={[...SOURCE_ORDER_COLLECTION_OPTIONS]}
          />
          <Select
            style={{ width: 120 }}
            value={draft.hasDiscount}
            onChange={(value) => onDraftChange({ ...draft, hasDiscount: value })}
            options={[
              { value: 'all', label: '全部优惠' },
              { value: 'yes', label: '有优惠' },
              { value: 'no', label: '无优惠' },
            ]}
          />
          <Input
            allowClear
            placeholder="搜索客户名称、备注"
            style={{ width: 220 }}
            value={draft.keyword}
            onChange={(event) => onDraftChange({ ...draft, keyword: event.target.value })}
          />
          <Button onClick={onApply}>查询</Button>
          <Button onClick={onReset}>重置</Button>
        </Space>
        {extra ? <div style={{ flexShrink: 0 }}>{extra}</div> : null}
      </div>
    </Card>
  )
}
