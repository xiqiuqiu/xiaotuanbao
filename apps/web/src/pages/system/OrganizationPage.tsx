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

  const examples = organization?.numberingExamples

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        组织管理
      </Typography.Title>

      <Card title="组织信息" style={{ marginBottom: 16 }}>
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="Organization ID">{organization?.id}</Descriptions.Item>
          <Descriptions.Item label="Organization 名称">{organization?.name}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="编号设置">
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="组织业务前缀">
            {organization?.businessPrefix ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label="设置状态">已设置，不可修改</Descriptions.Item>
          <Descriptions.Item label="发团编号示例">{examples?.departure ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="应收编号示例">{examples?.receivable ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="应付编号示例">{examples?.payable ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="流水编号示例">{examples?.transaction ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="核销编号示例">{examples?.verification ?? '-'}</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  )
}
