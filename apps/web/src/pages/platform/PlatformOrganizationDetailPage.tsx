import { useState } from 'react'
import { App, Button, Descriptions, Form, Space, Spin, Tag, Typography } from 'antd'
import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { OrganizationStatus } from '@xiaotuanbao/shared'
import { formatBusinessDateTime } from '@/utils/formatBusinessDateTime'
import {
  getPlatformOrganization,
  updatePlatformOrganization,
} from '@/services/platform-organization.service'
import {
  RenamePlatformOrganizationDrawer,
  type RenamePlatformOrganizationFormValues,
} from './RenamePlatformOrganizationDrawer'

export function PlatformOrganizationDetailPage() {
  const { message } = App.useApp()
  const { organizationId } = useParams({ strict: false })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<RenamePlatformOrganizationFormValues>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const goBack = () => void navigate({ to: '/platform/organizations' })

  const { data: organization, isLoading, isError } = useQuery({
    queryKey: ['platform-organization', organizationId],
    queryFn: () => getPlatformOrganization(organizationId!),
    enabled: Boolean(organizationId),
  })

  const closeDrawer = () => {
    setDrawerOpen(false)
    form.resetFields()
  }

  const renameMutation = useMutation({
    mutationFn: (values: RenamePlatformOrganizationFormValues) =>
      updatePlatformOrganization(organizationId!, { name: values.name.trim() }),
    onSuccess: () => {
      message.success('组织名称已更新')
      closeDrawer()
      void queryClient.invalidateQueries({ queryKey: ['platform-organization', organizationId] })
      void queryClient.invalidateQueries({ queryKey: ['platform-organizations'] })
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : '更新失败'
      if (errorMessage.includes('组织名称')) {
        form.setFields([{ name: 'name', errors: [errorMessage] }])
        return
      }
      message.error(errorMessage)
    },
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
      <Space align="start" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
        <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 0 }}>
          {organization.name}
        </Typography.Title>
        <Button
          type="primary"
          icon={<EditOutlined />}
          onClick={() => {
            form.setFieldsValue({ name: organization.name })
            setDrawerOpen(true)
          }}
        >
          修改名称
        </Button>
      </Space>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
        组织档案元数据；不含发团、财务、员工等业务数据。可修改组织名称，业务前缀不可改。
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
      <RenamePlatformOrganizationDrawer
        open={drawerOpen}
        loading={renameMutation.isPending}
        businessPrefix={organization.businessPrefix}
        form={form}
        onClose={closeDrawer}
        onSubmit={(values) => {
          renameMutation.mutate(values)
        }}
      />
    </div>
  )
}
