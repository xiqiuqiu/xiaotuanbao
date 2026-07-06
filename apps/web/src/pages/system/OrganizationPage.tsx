import { Card, Descriptions, Spin, Typography } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { getOrganization } from '@/services/organization.service'

export function OrganizationPage() {
  const { data: organization, isLoading } = useQuery({
    queryKey: ['organization'],
    queryFn: getOrganization,
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
        组织管理
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        第一版仅展示当前 Organization 基本信息。
      </Typography.Paragraph>

      <Card>
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="Organization ID">{organization?.id}</Descriptions.Item>
          <Descriptions.Item label="Organization 名称">{organization?.name}</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  )
}
