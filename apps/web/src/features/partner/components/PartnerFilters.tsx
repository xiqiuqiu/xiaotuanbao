import { Button, Card, Input, Select, Space, Switch } from 'antd'
import { DirectoryProfileStatus } from '@xiaotuanbao/shared'
import type { PartnerKind, PartnerType } from '@xiaotuanbao/shared'
import { DIRECTORY_PROFILE_STATUS_OPTIONS } from '@/features/directory/catalog'
import { PARTNER_KIND_OPTIONS, PARTNER_TYPE_OPTIONS } from '../catalog'

interface PartnerFiltersProps {
  partnerKindFilter?: PartnerKind
  partnerTypeFilter?: PartnerType
  statusFilter?: DirectoryProfileStatus
  includeArchived: boolean
  onSearch: (value: string) => void
  onPartnerKindChange: (value?: PartnerKind) => void
  onPartnerTypeChange: (value?: PartnerType) => void
  onStatusChange: (value?: DirectoryProfileStatus) => void
  onIncludeArchivedChange: (value: boolean) => void
  onReset: () => void
}

export function PartnerFilters({
  partnerKindFilter,
  partnerTypeFilter,
  statusFilter,
  includeArchived,
  onSearch,
  onPartnerKindChange,
  onPartnerTypeChange,
  onStatusChange,
  onIncludeArchivedChange,
  onReset,
}: PartnerFiltersProps) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <Space wrap>
        <Select
          allowClear
          placeholder="合作方向"
          style={{ width: 140 }}
          value={partnerKindFilter}
          onChange={onPartnerKindChange}
          options={[...PARTNER_KIND_OPTIONS]}
        />
        <Select
          allowClear
          placeholder="合作伙伴类型"
          style={{ width: 160 }}
          value={partnerTypeFilter}
          onChange={onPartnerTypeChange}
          options={[...PARTNER_TYPE_OPTIONS]}
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
        <Space>
          <span>显示已归档</span>
          <Switch checked={includeArchived} onChange={onIncludeArchivedChange} />
        </Space>
        <Button onClick={onReset}>重置</Button>
      </Space>
    </Card>
  )
}
