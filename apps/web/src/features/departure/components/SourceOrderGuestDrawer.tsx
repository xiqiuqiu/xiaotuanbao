import { useState } from 'react'
import { PlusOutlined, TeamOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Col,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Typography,
  message,
  theme,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SourceOrderSummary, SourceOrderGuestSummary } from '@/types/api'
import {
  createSourceOrderGuest,
  deleteSourceOrderGuest,
  listSourceOrderGuests,
  updateSourceOrderGuest,
} from '@/services/source-order.service'
import { GUEST_GENDER_OPTIONS, GUEST_GENDER_LABELS, catalogLabel } from '../catalog'
import {
  formatGuestCountContrast,
  guestFormFieldRules,
} from '../utils/source-order-guest-form'

interface SourceOrderGuestDrawerProps {
  open: boolean
  sourceOrder: SourceOrderSummary | null
  readOnly: boolean
  onClose: () => void
}

interface GuestFormValues {
  name: string
  phone?: string
  gender?: string
  notes?: string
}

export function SourceOrderGuestDrawer({
  open,
  sourceOrder,
  readOnly,
  onClose,
}: SourceOrderGuestDrawerProps) {
  if (!open || !sourceOrder) {
    return <Drawer open={open} onClose={onClose} />
  }

  return (
    <SourceOrderGuestDrawerPanel
      key={sourceOrder.id}
      open={open}
      sourceOrder={sourceOrder}
      readOnly={readOnly}
      onClose={onClose}
    />
  )
}

interface SourceOrderGuestDrawerPanelProps {
  open: boolean
  sourceOrder: SourceOrderSummary
  readOnly: boolean
  onClose: () => void
}

function SourceOrderGuestDrawerPanel({
  open,
  sourceOrder,
  readOnly,
  onClose,
}: SourceOrderGuestDrawerPanelProps) {
  const { token } = theme.useToken()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<GuestFormValues>()
  const [editingGuest, setEditingGuest] = useState<SourceOrderGuestSummary | null>(null)

  const sourceOrderId = sourceOrder.id

  const { data: guests = [], isLoading } = useQuery({
    queryKey: ['source-order-guests', sourceOrderId],
    queryFn: () => listSourceOrderGuests(sourceOrderId),
  })

  const saveMutation = useMutation({
    mutationFn: (values: GuestFormValues) => {
      if (editingGuest) {
        return updateSourceOrderGuest(sourceOrderId, editingGuest.id, values)
      }
      return createSourceOrderGuest(sourceOrderId, values)
    },
    onSuccess: () => {
      message.success(editingGuest ? '客人已更新' : '客人已添加')
      setEditingGuest(null)
      form.resetFields()
      void queryClient.invalidateQueries({ queryKey: ['source-order-guests', sourceOrderId] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (guestId: string) => deleteSourceOrderGuest(sourceOrderId, guestId),
    onSuccess: () => {
      message.success('客人已删除')
      void queryClient.invalidateQueries({ queryKey: ['source-order-guests', sourceOrderId] })
    },
  })

  const columns: ColumnsType<SourceOrderGuestSummary> = [
    { title: '姓名', dataIndex: 'name' },
    { title: '手机号', dataIndex: 'phone', render: (value) => value ?? '—' },
    {
      title: '性别',
      dataIndex: 'gender',
      render: (value) => catalogLabel(GUEST_GENDER_LABELS, value),
    },
    {
      title: '备注',
      dataIndex: 'notes',
      ellipsis: true,
      render: (value) => value ?? '—',
    },
    ...(readOnly
      ? []
      : [
          {
            title: '操作',
            key: 'actions',
            render: (_: unknown, record: SourceOrderGuestSummary) => (
              <Space>
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    setEditingGuest(record)
                    form.setFieldsValue({
                      name: record.name,
                      phone: record.phone ?? undefined,
                      gender: record.gender,
                      notes: record.notes ?? undefined,
                    })
                  }}
                >
                  编辑
                </Button>
                <Popconfirm
                  title="确认删除该客人？"
                  onConfirm={() => deleteMutation.mutate(record.id)}
                >
                  <Button type="link" size="small" danger>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]),
  ]

  return (
    <Drawer
      title={
        <Space size={8} align="baseline" wrap>
          <Typography.Text strong style={{ fontSize: token.fontSizeLG }}>
            客人名单
          </Typography.Text>
          <Typography.Text type="secondary">{sourceOrder.displayName}</Typography.Text>
        </Space>
      }
      open={open}
      size={720}
      onClose={onClose}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        icon={<TeamOutlined />}
        title={formatGuestCountContrast(guests.length, sourceOrder.guestCount)}
        style={{ marginBottom: 16 }}
      />

      {!readOnly ? (
        <Form
          form={form}
          layout="vertical"
          style={{ marginBottom: 16 }}
          onFinish={(values) => saveMutation.mutate(values)}
        >
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="name" label="姓名" rules={guestFormFieldRules.name}>
                <Input placeholder="请输入姓名" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="phone" label="手机号" rules={guestFormFieldRules.phone}>
                <Input placeholder="请输入手机号" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="gender" label="性别" rules={guestFormFieldRules.gender}>
                <Select
                  allowClear
                  placeholder="请选择性别"
                  options={[...GUEST_GENDER_OPTIONS]}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="notes" label="备注" rules={guestFormFieldRules.notes}>
                <Input placeholder="请输入备注（选填）" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                icon={editingGuest ? undefined : <PlusOutlined />}
                loading={saveMutation.isPending}
              >
                {editingGuest ? '保存' : '添加'}
              </Button>
              {editingGuest ? (
                <Button
                  onClick={() => {
                    setEditingGuest(null)
                    form.resetFields()
                  }}
                >
                  取消编辑
                </Button>
              ) : null}
            </Space>
          </Form.Item>
        </Form>
      ) : null}

      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={guests}
        pagination={false}
        size="small"
        locale={{ emptyText: '暂无数据' }}
      />
    </Drawer>
  )
}
