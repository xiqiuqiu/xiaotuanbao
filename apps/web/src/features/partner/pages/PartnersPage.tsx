import { useCallback, useMemo, useState } from 'react'
import { Button, Card, Form, Space, Table, Tag, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnsType } from 'antd/es/table'
import type { PartnerSummary } from '@/types/api'
import { DirectoryProfileStatus } from '@xiaotuanbao/shared'
import { createPartner, listPartners, updatePartner } from '@/services/partner.service'
import { PartnerFormDrawer } from '../components/PartnerFormDrawer'
import type { PartnerFormValues } from '../components/PartnerProfileSections'
import {
  PARTNER_KIND_LABELS,
  PARTNER_TYPE_LABELS,
  catalogLabel,
} from '../catalog'
import {
  DIRECTORY_PROFILE_STATUS_LABELS,
  SETTLEMENT_CYCLE_LABELS,
  SETTLEMENT_METHOD_LABELS,
} from '@/features/directory/catalog'
import {
  buildCreatePayload,
  buildUpdatePayload,
  partnerToFormValues,
} from '../utils/partner-form'

function buildColumns(onEdit: (partner: PartnerSummary) => void): ColumnsType<PartnerSummary> {
  return [
    {
      title: '合作伙伴名称',
      dataIndex: 'name',
      render: (name: string) => <Typography.Text strong>{name}</Typography.Text>,
    },
    {
      title: '合作伙伴类型',
      dataIndex: 'partnerType',
      render: (value: string) => catalogLabel(PARTNER_TYPE_LABELS, value),
    },
    {
      title: '合作方向',
      dataIndex: 'partnerKind',
      render: (value: string) => catalogLabel(PARTNER_KIND_LABELS, value),
    },
    { title: '主联系人', dataIndex: 'contactName', render: (value) => value ?? '—' },
    { title: '联系方式', dataIndex: 'contactPhone', render: (value) => value ?? '—' },
    {
      title: '结算方式',
      dataIndex: 'settlementMethod',
      render: (value: string | null) => catalogLabel(SETTLEMENT_METHOD_LABELS, value),
    },
    {
      title: '账期规则',
      dataIndex: 'paymentTermRule',
      render: (value: string | null) => catalogLabel(SETTLEMENT_CYCLE_LABELS, value),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status: string) => {
        const color =
          status === DirectoryProfileStatus.ACTIVE
            ? 'success'
            : status === DirectoryProfileStatus.ARCHIVED
              ? 'default'
              : 'warning'
        return <Tag color={color}>{DIRECTORY_PROFILE_STATUS_LABELS[status] ?? status}</Tag>
      },
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => {
        if (record.status === DirectoryProfileStatus.ARCHIVED) {
          return null
        }

        return (
          <Space>
            <Button type="link" onClick={() => onEdit(record)}>
              编辑
            </Button>
          </Space>
        )
      },
    },
  ]
}

export function PartnersPage() {
  const queryClient = useQueryClient()
  const [form] = Form.useForm<PartnerFormValues>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingPartner, setEditingPartner] = useState<PartnerSummary | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const { data: partnersResult, isLoading } = useQuery({
    queryKey: ['partners', page, pageSize],
    queryFn: () => listPartners({ page, pageSize }),
  })

  const closeDrawer = () => {
    setDrawerOpen(false)
    setEditingPartner(null)
    form.resetFields()
  }

  const openCreateDrawer = () => {
    setEditingPartner(null)
    form.resetFields()
    setDrawerOpen(true)
  }

  const openEditDrawer = useCallback(
    (partner: PartnerSummary) => {
      setEditingPartner(partner)
      form.setFieldsValue(partnerToFormValues(partner))
      setDrawerOpen(true)
    },
    [form],
  )

  const saveMutation = useMutation({
    mutationFn: async (values: PartnerFormValues) => {
      if (editingPartner) {
        return updatePartner(editingPartner.id, buildUpdatePayload(values))
      }
      return createPartner(buildCreatePayload(values))
    },
    onSuccess: () => {
      message.success(editingPartner ? '合作伙伴已更新' : '合作伙伴已创建')
      closeDrawer()
      queryClient.invalidateQueries({ queryKey: ['partners'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存失败')
    },
  })

  const columns = useMemo(() => buildColumns(openEditDrawer), [openEditDrawer])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
            合作伙伴管理
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            维护同业旅行社合作伙伴档案
          </Typography.Paragraph>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
          创建合作伙伴
        </Button>
      </div>

      <Card>
        <Table
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={partnersResult?.items ?? []}
          pagination={{
            current: page,
            pageSize,
            total: partnersResult?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage)
              setPageSize(nextPageSize)
            },
          }}
        />
      </Card>

      <PartnerFormDrawer
        open={drawerOpen}
        editing={Boolean(editingPartner)}
        loading={saveMutation.isPending}
        form={form}
        onClose={closeDrawer}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
    </div>
  )
}
