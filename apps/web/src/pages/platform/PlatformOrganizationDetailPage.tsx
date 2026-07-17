import { Button, Descriptions, Spin, Tag, Typography } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { OrganizationStatus } from '@xiaotuanbao/shared'
import { formatBusinessDateTime } from '@/utils/formatBusinessDateTime'
import { getPlatformOrganization } from '@/services/platform-organization.service'

export function PlatformOrganizationDetailPage() {
  const { organizationId } = useParams({ strict: false })
  const navigate = useNavigate()
  const goBack = () => void navigate({ to: '/platform/organizations' })

  const { data: organization, isLoading, isError } = useQuery({
    queryKey: ['platform-organization', organizationId],
    queryFn: () => getPlatformOrganization(organizationId!),
    enabled: Boolean(organizationId),
  })

  if (!organizationId) {
    return (
      <div>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          style={{ paddingLeft: 0, marginBottom: 16 }}
          onClick={goBack}
        >
          返回名录
        </Button>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          Organization 不存在
        </Typography.Title>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin />
      </div>
    )
  }

  if (isError || !organization) {
    return (
      <div>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          style={{ paddingLeft: 0, marginBottom: 16 }}
          onClick={goBack}
        >
          返回名录
        </Button>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          Organization 不存在
        </Typography.Title>
      </div>
    )
  }

  return (
    <div>
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        style={{ paddingLeft: 0, marginBottom: 16 }}
        onClick={goBack}
      >
        返回名录
      </Button>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {organization.name}
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
        只读组织档案，不含发团、财务、员工等业务数据。
      </Typography.Paragraph>
      <Descriptions bordered column={1} size="middle">
        <Descriptions.Item label="组织名称">{organization.name}</Descriptions.Item>
        <Descriptions.Item label="业务前缀">{organization.businessPrefix}</Descriptions.Item>
        <Descriptions.Item label="组织状态">
          <Tag
            color={
              organization.status === OrganizationStatus.ENABLED ? 'success' : 'default'
            }
          >
            {organization.status === OrganizationStatus.ENABLED ? '启用' : '停用'}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="创建时间">
          {formatBusinessDateTime(organization.createdAt)}
        </Descriptions.Item>
        <Descriptions.Item label="更新时间">
          {formatBusinessDateTime(organization.updatedAt)}
        </Descriptions.Item>
      </Descriptions>
    </div>
  )
}
