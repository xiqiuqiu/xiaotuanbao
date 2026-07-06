import { Card, Input, Select, Space } from 'antd'
import { UserStatus } from '@xiaotuanbao/shared'

interface RoleOption {
  label: string
  value: string
}

interface EmployeeFiltersProps {
  statusFilter?: UserStatus
  roleFilter?: string
  roleOptions: RoleOption[]
  onStatusChange: (value?: UserStatus) => void
  onRoleChange: (value?: string) => void
  onSearch: (value: string) => void
}

export function EmployeeFilters({
  statusFilter,
  roleFilter,
  roleOptions,
  onStatusChange,
  onRoleChange,
  onSearch,
}: EmployeeFiltersProps) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <Space wrap>
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 120 }}
          value={statusFilter}
          onChange={onStatusChange}
          options={[
            { label: '启用', value: UserStatus.ENABLED },
            { label: '停用', value: UserStatus.DISABLED },
          ]}
        />
        <Select
          allowClear
          placeholder="角色"
          style={{ width: 160 }}
          value={roleFilter}
          onChange={onRoleChange}
          options={roleOptions}
        />
        <Input.Search
          allowClear
          placeholder="搜索姓名 / 账号"
          style={{ width: 240 }}
          onSearch={(value) => onSearch(value.trim())}
        />
      </Space>
    </Card>
  )
}
