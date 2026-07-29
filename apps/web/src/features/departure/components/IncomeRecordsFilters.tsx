import { Input, Select, Space } from 'antd'
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
  { value: 'all' as const, label: '全部综合状态' },
  ...Object.values(DepartureIncomeSettlementComposite).map((value) => ({
    value,
    label: DEPARTURE_INCOME_SETTLEMENT_COMPOSITE_LABELS[value],
  })),
]

type IncomeRecordsFiltersProps = {
  typeFilter: DepartureIncomeType | 'all'
  compositeFilter: DepartureIncomeSettlementComposite | 'all'
  onTypeChange: (value: DepartureIncomeType | 'all') => void
  onCompositeChange: (value: DepartureIncomeSettlementComposite | 'all') => void
  onKeywordSearch: (value: string) => void
}

export function IncomeRecordsFilters({
  typeFilter,
  compositeFilter,
  onTypeChange,
  onCompositeChange,
  onKeywordSearch,
}: IncomeRecordsFiltersProps) {
  return (
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
        aria-label="综合状态筛选"
      />
      <Input.Search
        allowClear
        placeholder="项目名称 / 备注 / 合作方"
        style={{ width: 240 }}
        onSearch={onKeywordSearch}
        onChange={(event) => {
          if (!event.target.value) onKeywordSearch('')
        }}
      />
    </Space>
  )
}
