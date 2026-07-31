import type { ReactNode } from 'react'
import { Button, Input, Select, Space } from 'antd'
import {
  DEPARTURE_INCOME_SETTLEMENT_COMPOSITE_LABELS,
  DEPARTURE_INCOME_TYPE_LABELS,
  DepartureIncomeSettlementComposite,
  DepartureIncomeType,
} from '@xiaotuanbao/shared'

const TYPE_FILTER_OPTIONS = [
  { value: 'all' as const, label: '全部类型' },
  ...Object.values(DepartureIncomeType).map((value) => ({
    value,
    label: DEPARTURE_INCOME_TYPE_LABELS[value],
  })),
]

const COMPOSITE_FILTER_OPTIONS = [
  { value: 'all' as const, label: '全部状态' },
  ...Object.values(DepartureIncomeSettlementComposite).map((value) => ({
    value,
    label: DEPARTURE_INCOME_SETTLEMENT_COMPOSITE_LABELS[value],
  })),
]

type IncomeRecordsFiltersProps = {
  typeFilter: DepartureIncomeType | 'all'
  compositeFilter: DepartureIncomeSettlementComposite | 'all'
  keyword: string
  onTypeChange: (value: DepartureIncomeType | 'all') => void
  onCompositeChange: (value: DepartureIncomeSettlementComposite | 'all') => void
  onKeywordChange: (value: string) => void
  onApply: () => void
  onReset: () => void
  extra?: ReactNode
}

export function IncomeRecordsFilters({
  typeFilter,
  compositeFilter,
  keyword,
  onTypeChange,
  onCompositeChange,
  onKeywordChange,
  onApply,
  onReset,
  extra,
}: IncomeRecordsFiltersProps) {
  return (
    <Space wrap style={{ width: '100%', marginBottom: 16, justifyContent: 'space-between' }}>
      <Space wrap>
        <Select
          style={{ width: 160 }}
          value={typeFilter}
          options={TYPE_FILTER_OPTIONS}
          onChange={onTypeChange}
          aria-label="增收类型筛选"
        />
        <Select
          style={{ width: 160 }}
          value={compositeFilter}
          options={COMPOSITE_FILTER_OPTIONS}
          onChange={onCompositeChange}
          aria-label="状态筛选"
        />
        <Input
          allowClear
          placeholder="项目名称 / 备注 / 合作方"
          style={{ width: 240 }}
          value={keyword}
          aria-label="搜索项目名称、备注、合作方"
          onChange={(event) => onKeywordChange(event.target.value)}
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
  )
}
