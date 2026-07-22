import { Checkbox, Input, Select, Space } from 'antd'
import { ProductStatus } from '@xiaotuanbao/shared'
import { PRODUCT_STATUS_LABELS } from '../utils/product-labels'

type ProductListFiltersProps = {
  statusFilter: ProductStatus | undefined
  includeOffline: boolean
  importSessionId: string
  sourceSheetName: string
  onSearch: (value: string) => void
  onStatusChange: (value: ProductStatus | undefined) => void
  onIncludeOfflineChange: (value: boolean) => void
  onImportSessionIdChange: (value: string) => void
  onSourceSheetNameChange: (value: string) => void
  onCommitImportFilters: () => void
}

export function ProductListFilters({
  statusFilter,
  includeOffline,
  importSessionId,
  sourceSheetName,
  onSearch,
  onStatusChange,
  onIncludeOfflineChange,
  onImportSessionIdChange,
  onSourceSheetNameChange,
  onCommitImportFilters,
}: ProductListFiltersProps) {
  return (
    <Space wrap style={{ marginBottom: 16 }}>
      <Input.Search
        allowClear
        placeholder="搜索产品名称或城市"
        style={{ width: 240 }}
        onSearch={onSearch}
      />
      <Select
        allowClear
        placeholder="状态"
        style={{ width: 140 }}
        value={statusFilter}
        options={Object.values(ProductStatus).map((status) => ({
          value: status,
          label: PRODUCT_STATUS_LABELS[status],
        }))}
        onChange={onStatusChange}
      />
      <Input
        allowClear
        placeholder="导入会话 ID"
        style={{ width: 220 }}
        value={importSessionId}
        onChange={(event) => onImportSessionIdChange(event.target.value)}
        onBlur={onCommitImportFilters}
        onPressEnter={onCommitImportFilters}
      />
      <Input
        allowClear
        placeholder="来源 Sheet"
        style={{ width: 200 }}
        value={sourceSheetName}
        onChange={(event) => onSourceSheetNameChange(event.target.value)}
        onBlur={onCommitImportFilters}
        onPressEnter={onCommitImportFilters}
      />
      <Checkbox
        checked={includeOffline}
        onChange={(event) => onIncludeOfflineChange(event.target.checked)}
      >
        含已下架
      </Checkbox>
    </Space>
  )
}
