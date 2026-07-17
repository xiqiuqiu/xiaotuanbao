import { useState } from 'react'
import { App, Button, Descriptions, Form, Space, Spin, Tag, Typography } from 'antd'
import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { OrganizationStatus } from '@xiaotuanbao/shared'
import { formatBusinessDateTime } from '@/utils/formatBusinessDateTime'
import {
  disablePlatformOrganization,
  enablePlatformOrganization,
  getPlatformOrganization,
  updatePlatformOrganization,
} from '@/services/platform-organization.service'
import {
  RenamePlatformOrganizationDrawer,
  type RenamePlatformOrganizationFormValues,
} from './RenamePlatformOrganizationDrawer'

export function PlatformOrganizationDetailPage() {
  const { message, modal } = App.useApp()
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

  const invalidateOrganizationQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['platform-organization', organizationId] })
    void queryClient.invalidateQueries({ queryKey: ['platform-organizations'] })
  }

  const renameMutation = useMutation({
    mutationFn: (values: RenamePlatformOrganizationFormValues) =>
      updatePlatformOrganization(organizationId!, { name: values.name.trim() }),
    onSuccess: () => {
      message.success('组织名称已更新')
      closeDrawer()
      invalidateOrganizationQueries()
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

  const disableMutation = useMutation({
    mutationFn: () => disablePlatformOrganization(organizationId!),
    onSuccess: () => {
      message.success('组织已停用')
      invalidateOrganizationQueries()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '停用失败')
    },
  })

  const enableMutation = useMutation({
    mutationFn: () => enablePlatformOrganization(organizationId!),
    onSuccess: () => {
      message.success('组织已启用')
      invalidateOrganizationQueries()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '启用失败')
    },
  })

  const statusActionPending = disableMutation.isPending || enableMutation.isPending

  const confirmDisable = () => {
    modal.confirm({
      title: '确认停用组织？',
      content: `停用后「${organization?.name ?? ''}」下的用户将无法登录，已有会话会失效。可随时再启用。`,
      okText: '停用',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => disableMutation.mutateAsync(),
    })
  }

  const confirmEnable = () => {
    modal.confirm({
      title: '确认启用组织？',
      content: `启用后「${organization?.name ?? ''}」下的用户可重新登录。`,
      okText: '启用',
      cancelText: '取消',
      onOk: () => enableMutation.mutateAsync(),
    })
  }

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
        <Space>
          {organization.status === OrganizationStatus.ENABLED ? (
            <>
              <Button danger loading={statusActionPending} onClick={confirmDisable}>
                停用组织
              </Button>
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
            </>
          ) : (
            <>
              <Button
                icon={<EditOutlined />}
                onClick={() => {
                  form.setFieldsValue({ name: organization.name })
                  setDrawerOpen(true)
                }}
              >
                修改名称
              </Button>
              <Button type="primary" loading={statusActionPending} onClick={confirmEnable}>
                启用组织
              </Button>
            </>
          )}
        </Space>
      </Space>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
        组织档案元数据；不含发团、财务、员工等业务数据。可修改名称、启用或停用；业务前缀不可改。停用后该组织用户无法登录。
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
