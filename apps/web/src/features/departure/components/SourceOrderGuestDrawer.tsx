import { useState } from 'react'
import {
  Button,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SourceOrderSummary, SourceOrderGuestSummary } from '@/types/api'
import {
  createSourceOrderGuest,
  deleteSourceOrderGuest,
  listSourceOrderGuests,
  syncSourceOrderGuestCount,
  updateSourceOrderGuest,
} from '@/services/source-order.service'
import { GUEST_GENDER_OPTIONS, GUEST_GENDER_LABELS, catalogLabel } from '../catalog'

interface SourceOrderGuestDrawerProps {
  open: boolean
  sourceOrder: SourceOrderSummary | null
  readOnly: boolean
  onClose: () => void
  onSynced: () => void
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
  onSynced,
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
      onSynced={onSynced}
    />
  )
}

interface SourceOrderGuestDrawerPanelProps {
  open: boolean
  sourceOrder: SourceOrderSummary
  readOnly: boolean
  onClose: () => void
  onSynced: () => void
}

function SourceOrderGuestDrawerPanel({
  open,
  sourceOrder,
  readOnly,
  onClose,
  onSynced,
}: SourceOrderGuestDrawerPanelProps) {
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
      void queryClient.invalidateQueries({ queryKey: ['source-orders'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (guestId: string) => deleteSourceOrderGuest(sourceOrderId, guestId),
    onSuccess: () => {
      message.success('客人已删除')
      void queryClient.invalidateQueries({ queryKey: ['source-order-guests', sourceOrderId] })
      void queryClient.invalidateQueries({ queryKey: ['source-orders'] })
    },
  })

  const syncMutation = useMutation({
    mutationFn: () => syncSourceOrderGuestCount(sourceOrderId),
    onSuccess: () => {
      message.success('已同步客人人数')
      void queryClient.invalidateQueries({ queryKey: ['source-order-guests', sourceOrderId] })
      void queryClient.invalidateQueries({ queryKey: ['source-orders'] })
      onSynced()
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
      title={`客人名单 · ${sourceOrder.displayName}`}
      open={open}
      width={720}
      onClose={onClose}
      destroyOnClose
      extra={
        readOnly ? null : (
          <Button
            loading={syncMutation.isPending}
            onClick={() => syncMutation.mutate()}
            disabled={guests.length === 0}
          >
            同步人数
          </Button>
        )
      }
    >
      {!readOnly ? (
        <Form
          form={form}
          layout="inline"
          style={{ marginBottom: 16 }}
          onFinish={(values) => saveMutation.mutate(values)}
        >
          <Form.Item
            name="name"
            rules={[{ required: true, message: '请输入姓名' }]}
            style={{ minWidth: 120 }}
          >
            <Input placeholder="姓名" />
          </Form.Item>
          <Form.Item name="phone">
            <Input placeholder="手机号" style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="gender" initialValue="unknown">
            <Select style={{ width: 100 }} options={[...GUEST_GENDER_OPTIONS]} />
          </Form.Item>
          <Form.Item name="notes">
            <Input placeholder="备注" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={saveMutation.isPending}>
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

      <Typography.Paragraph type="secondary">
        当前名单 {guests.length} 人 · 客源单人数 {sourceOrder.guestCount} 人
      </Typography.Paragraph>

      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={guests}
        pagination={false}
        size="small"
      />
    </Drawer>
  )
}
