import { Button, Space, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { EmployeeSummary } from '@/types/api'
import { UserStatus } from '@xiaotuanbao/shared'
import { buildBusinessTimestampColumns } from '@/components/businessTimestampColumns'
import { formatLastLogin } from './formatLastLogin'

export function buildEmployeeColumns(
  onEdit: (employee: EmployeeSummary) => void,
  onDisable: (employee: EmployeeSummary) => void,
): ColumnsType<EmployeeSummary> {
  return [
    { title: '员工信息', dataIndex: 'name', render: (name: string) => <Typography.Text strong>{name}</Typography.Text> },
    { title: '登录用户名', dataIndex: 'username' },
    { title: '角色', dataIndex: 'roles', render: (roleNames: string[]) => roleNames.map((role) => <Tag key={role}>{role}</Tag>) },
    { title: '最近活跃', dataIndex: 'lastLoginAt', render: (value: string | null) => formatLastLogin(value) },
    { title: '状态', dataIndex: 'status', render: (status: UserStatus) => <Tag color={status === UserStatus.ENABLED ? 'success' : 'default'}>{status === UserStatus.ENABLED ? '启用' : '停用'}</Tag> },
    ...buildBusinessTimestampColumns<EmployeeSummary>(),
    {
      title: '操作', key: 'actions', render: (_, record) => (
        <Space><Button type="link" onClick={() => onEdit(record)}>编辑</Button>{record.status === UserStatus.ENABLED ? <Button type="link" danger onClick={() => onDisable(record)}>停用</Button> : null}</Space>
      ),
    },
  ]
}
