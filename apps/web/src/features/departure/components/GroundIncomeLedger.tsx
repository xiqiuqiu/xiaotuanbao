import { useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Space,
  Table,
  Typography,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { GroundIncomeSummary } from '@/types/api'
import { StaleDataAlert } from '@/components/StaleDataAlert'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import {
  createGroundIncome,
  deleteGroundIncome,
  listGroundIncomes,
  updateGroundIncome,
} from '@/services/ground-income.service'
import { formatCents } from '../catalog'

interface GroundIncomeLedgerProps {
  departureId: string
  mutationLocked: boolean
}

interface GroundIncomeFormValues {
  title: string
  amountYuan: number
}

export function GroundIncomeLedger({
  departureId,
  mutationLocked,
}: GroundIncomeLedgerProps) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<GroundIncomeFormValues>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<GroundIncomeSummary | null>(null)

  const query = useQuery({
    queryKey: ['ground-incomes', departureId],
    queryFn: ({ signal }) => listGroundIncomes(departureId, signal),
    ...operationalQueryOptions(),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['ground-incomes', departureId] })
    void queryClient.invalidateQueries({ queryKey: ['departure', departureId] })
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setEditing(null)
    form.resetFields()
  }

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setDrawerOpen(true)
  }

  const openEdit = (item: GroundIncomeSummary) => {
    setEditing(item)
    form.setFieldsValue({
      title: item.title,
      amountYuan: item.amountCents / 100,
    })
    setDrawerOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: (values: GroundIncomeFormValues) => {
      const payload = {
        title: values.title,
        amountCents: Math.round(values.amountYuan * 100),
      }
      return editing
        ? updateGroundIncome(departureId, editing.id, payload)
        : createGroundIncome(departureId, payload)
    },
    onSuccess: () => {
      message.success(editing ? '团上收入已更新' : '团上收入已添加')
      closeDrawer()
      refresh()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存团上收入失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGroundIncome(departureId, id),
    onSuccess: () => {
      message.success('团上收入已删除')
      refresh()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '删除团上收入失败')
    },
  })

  const columns: TableColumnsType<GroundIncomeSummary> = [
    {
      title: '收入标题',
      dataIndex: 'title',
      ellipsis: true,
    },
    {
      title: '金额',
      dataIndex: 'amountCents',
      width: 180,
      align: 'right',
      render: (amountCents: number) => formatCents(amountCents),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, item) =>
        mutationLocked ? null : (
          <Space size={4}>
            <Button type="link" size="small" onClick={() => openEdit(item)}>
              编辑
            </Button>
            <Popconfirm
              title="删除团上收入"
              description={`确定删除「${item.title}」吗？`}
              okText="删除"
              okButtonProps={{ danger: true, loading: deleteMutation.isPending }}
              cancelText="取消"
              onConfirm={() => deleteMutation.mutate(item.id)}
            >
              <Button type="link" size="small" danger>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
    },
  ]

  return (
    <>
      <Card
        title="团上收入台账"
        extra={
          <Space size={16}>
            <Typography.Text strong>
              其他收入 {formatCents(query.data?.totalCents ?? 0)}
            </Typography.Text>
            {!mutationLocked ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                添加收入
              </Button>
            ) : null}
          </Space>
        }
      >
        <Typography.Paragraph type="secondary">
          登记车销、签单、特产等团上收入；仅计入概览「其他收入」，不自动生成应收或流水。
        </Typography.Paragraph>
        <StaleDataAlert
          isFetching={query.isFetching}
          isError={query.isError}
          hasData={Boolean(query.data)}
          onRefresh={() => void query.refetch()}
        />
        {query.isError && !query.data ? (
          <Alert
            type="error"
            showIcon
            title="团上收入加载失败"
            action={
              <Button size="small" onClick={() => void query.refetch()}>
                重试
              </Button>
            }
          />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={query.data?.items ?? []}
            loading={query.isLoading}
            pagination={false}
            scroll={{ x: 480 }}
            locale={{ emptyText: '暂未登记团上收入' }}
          />
        )}
      </Card>

      <Drawer
        title={editing ? '编辑团上收入' : '添加团上收入'}
        open={drawerOpen}
        width={480}
        destroyOnHidden
        onClose={closeDrawer}
        extra={
          <Space>
            <Button onClick={closeDrawer}>取消</Button>
            <Button
              type="primary"
              loading={saveMutation.isPending}
              onClick={() => form.submit()}
            >
              保存
            </Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => saveMutation.mutate(values)}
        >
          <Form.Item
            name="title"
            label="收入标题"
            rules={[{ required: true, whitespace: true, message: '请填写收入标题' }]}
          >
            <Input placeholder="如车销、签单、特产" />
          </Form.Item>
          <Form.Item
            name="amountYuan"
            label="金额（元）"
            rules={[
              { required: true, message: '请填写金额' },
              { type: 'number', min: 0.01, message: '金额必须大于 0' },
            ]}
          >
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  )
}
