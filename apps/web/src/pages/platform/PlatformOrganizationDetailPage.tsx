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
  updatePlatformOrganizationBusinessPrefix,
} from '@/services/platform-organization.service'
import {
  RenamePlatformOrganizationDrawer,
  type RenamePlatformOrganizationFormValues,
} from './RenamePlatformOrganizationDrawer'
import {
  UpdatePlatformOrganizationBusinessPrefixDrawer,
  type UpdatePlatformOrganizationBusinessPrefixFormValues,
} from './UpdatePlatformOrganizationBusinessPrefixDrawer'

export function PlatformOrganizationDetailPage() {
  const { message, modal } = App.useApp()
  const { organizationId } = useParams({ strict: false })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<RenamePlatformOrganizationFormValues>()
  const [prefixForm] = Form.useForm<UpdatePlatformOrganizationBusinessPrefixFormValues>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [prefixDrawerOpen, setPrefixDrawerOpen] = useState(false)
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

  const closePrefixDrawer = () => {
    setPrefixDrawerOpen(false)
    prefixForm.resetFields()
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

  const prefixMutation = useMutation({
    mutationFn: (values: UpdatePlatformOrganizationBusinessPrefixFormValues) =>
      updatePlatformOrganizationBusinessPrefix(organizationId!, {
        businessPrefix: values.businessPrefix.trim().toUpperCase(),
      }),
    onSuccess: () => {
      message.success('业务前缀已更新')
      closePrefixDrawer()
      invalidateOrganizationQueries()
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : '更新失败'
      if (errorMessage.includes('业务前缀')) {
        prefixForm.setFields([{ name: 'businessPrefix', errors: [errorMessage] }])
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
  const profileActionPending = renameMutation.isPending || prefixMutation.isPending

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
          style={{ paddingInlineStart: 0, marginBottom: 16 }}
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
          style={{ paddingInlineStart: 0, marginBottom: 16 }}
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
        style={{ paddingInlineStart: 0, marginBottom: 16 }}
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
                loading={profileActionPending}
                onClick={() => {
                  prefixForm.setFieldsValue({ businessPrefix: organization.businessPrefix })
                  setPrefixDrawerOpen(true)
                }}
              >
                修改业务前缀
              </Button>
              <Button
                type="primary"
                icon={<EditOutlined />}
                loading={profileActionPending}
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
                loading={profileActionPending}
                onClick={() => {
                  form.setFieldsValue({ name: organization.name })
                  setDrawerOpen(true)
                }}
              >
                修改名称
              </Button>
              <Button
                loading={profileActionPending}
                onClick={() => {
                  prefixForm.setFieldsValue({ businessPrefix: organization.businessPrefix })
                  setPrefixDrawerOpen(true)
                }}
              >
                修改业务前缀
              </Button>
              <Button type="primary" loading={statusActionPending} onClick={confirmEnable}>
                启用组织
              </Button>
            </>
          )}
        </Space>
      </Space>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
        组织档案元数据；不含发团、财务、员工等业务数据。可修改名称与业务前缀、启用或停用；业务前缀变更不改写历史编号。停用后该组织用户无法登录。初始企业管理员仅只读核对，不在此管理。
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
        <Descriptions.Item label="初始企业管理员登录用户名">
          {organization.initialOrganizationAdmin?.username ?? '未设置'}
        </Descriptions.Item>
        <Descriptions.Item label="初始企业管理员显示名称">
          {organization.initialOrganizationAdmin?.name ?? '未设置'}
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
      <UpdatePlatformOrganizationBusinessPrefixDrawer
        open={prefixDrawerOpen}
        loading={prefixMutation.isPending}
        currentBusinessPrefix={organization.businessPrefix}
        form={prefixForm}
        onClose={closePrefixDrawer}
        onSubmit={(values) => {
          prefixMutation.mutate(values)
        }}
      />
    </div>
  )
}
