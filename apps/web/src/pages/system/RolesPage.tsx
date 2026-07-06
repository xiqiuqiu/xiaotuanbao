import { Card, Spin, Table, Typography } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { listRoles } from '@/services/role.service'

export function RolesPage() {
  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: listRoles,
  })

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin />
      </div>
    )
  }

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        角色权限
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        第一版 Preset Role 固定，以下展示各 Role 的 Menu Permission 映射（只读）。
      </Typography.Paragraph>

      {roles.map((role) => (
        <Card key={role.id} title={role.name} style={{ marginBottom: 16 }}>
          <Table
            size="small"
            pagination={false}
            rowKey="key"
            dataSource={role.menuKeys.map((key) => ({ key }))}
            columns={[{ title: 'Menu Key', dataIndex: 'key' }]}
          />
        </Card>
      ))}
    </div>
  )
}
