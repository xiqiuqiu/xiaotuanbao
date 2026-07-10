import { Card, Input, Select, Space } from 'antd'
import { DirectoryProfileStatus } from '@xiaotuanbao/shared'
import { DIRECTORY_PROFILE_STATUS_OPTIONS, SUPPLIER_CATEGORY_OPTIONS } from '../catalog'

interface SupplierFiltersProps {
  categoryFilter?: string
  statusFilter?: DirectoryProfileStatus
  includeArchived: boolean
  onCategoryChange: (value?: string) => void
  onStatusChange: (value?: DirectoryProfileStatus) => void
  onIncludeArchivedChange: (value: boolean) => void
  onSearch: (value: string) => void
}

export function SupplierFilters({
  categoryFilter,
  statusFilter,
  onCategoryChange,
  onStatusChange,
  onSearch,
}: SupplierFiltersProps) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <Space wrap>
        <Select
          allowClear
          placeholder="类别"
          style={{ width: 140 }}
          value={categoryFilter}
          onChange={onCategoryChange}
          options={[...SUPPLIER_CATEGORY_OPTIONS]}
        />
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 120 }}
          value={statusFilter}
          onChange={onStatusChange}
          options={[...DIRECTORY_PROFILE_STATUS_OPTIONS]}
        />
        <Input.Search
          allowClear
          placeholder="搜索名称 / 联系人 / 联系方式"
          style={{ width: 280 }}
          onSearch={(value) => onSearch(value.trim())}
        />
      </Space>
    </Card>
  )
}
