/**
 * PROTOTYPE Variant A — 统计条 + 筛选表 + Drawer
 * 信息架构：与现有资源安排 / 团上收入一致的后台表格范式，完整字段一览。
 */
import { useMemo, useState } from 'react'
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { formatCents } from '../../catalog'
import { MOCK_GUIDES, MOCK_PARTNERS } from './mock-data'
import {
  COMMISSION_STATUS_LABELS,
  INCOME_STATUS_LABELS,
  INCOME_TYPE_AMOUNT_HINTS,
  INCOME_TYPE_LABELS,
  SETTLEMENT_COMPOSITE_LABELS,
  companyIncomeCents,
  settlementComposite,
  summarizeRecords,
  type CommissionStatus,
  type IncomeRecord,
  type IncomeStatus,
  type IncomeType,
  type SettlementComposite,
} from './types'

export const VARIANT_A_META = {
  key: 'A',
  label: '统计+表格+抽屉',
} as const

type VariantAProps = {
  records: IncomeRecord[]
  onChange: (records: IncomeRecord[]) => void
}

type FormValues = {
  type: IncomeType
  projectName: string
  partnerName?: string
  occurredOn: dayjs.Dayjs
  amountYuan: number
  guideName?: string
  commissionYuan: number
  incomeStatus: IncomeStatus
  commissionStatus: CommissionStatus
  remark?: string
}

const TYPE_OPTIONS = (Object.keys(INCOME_TYPE_LABELS) as IncomeType[]).map((value) => ({
  value,
  label: INCOME_TYPE_LABELS[value],
}))

const COMPOSITE_COLORS: Record<SettlementComposite, string> = {
  pending_settle: 'default',
  pending_commission: 'warning',
  pending_collect: 'processing',
  settled: 'success',
}

export function VariantA({ records, onChange }: VariantAProps) {
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<IncomeRecord | null>(null)
  const [typeFilter, setTypeFilter] = useState<IncomeType | 'all'>('all')
  const [compositeFilter, setCompositeFilter] = useState<SettlementComposite | 'all'>('all')
  const [keyword, setKeyword] = useState('')

  const watchedType = Form.useWatch('type', form) as IncomeType | undefined
  const summary = summarizeRecords(records)

  const filtered = useMemo(() => {
    return records.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false
      if (compositeFilter !== 'all' && settlementComposite(item) !== compositeFilter) return false
      if (keyword.trim()) {
        const q = keyword.trim()
        const hay = `${item.projectName} ${item.remark ?? ''} ${item.partnerName ?? ''}`
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [records, typeFilter, compositeFilter, keyword])

  const openCreate = () => {
    setEditing(null)
    form.setFieldsValue({
      type: 'shopping_rebate',
      projectName: undefined,
      partnerName: undefined,
      occurredOn: dayjs(),
      amountYuan: undefined,
      guideName: undefined,
      commissionYuan: 0,
      incomeStatus: 'uncollected',
      commissionStatus: 'unpaid',
      remark: undefined,
    })
    setDrawerOpen(true)
  }

  const openEdit = (item: IncomeRecord) => {
    setEditing(item)
    form.setFieldsValue({
      type: item.type,
      projectName: item.projectName,
      partnerName: item.partnerName ?? undefined,
      occurredOn: dayjs(item.occurredOn),
      amountYuan: item.amountCents / 100,
      guideName: item.guideName ?? undefined,
      commissionYuan: item.commissionCents / 100,
      incomeStatus: item.incomeStatus,
      commissionStatus: item.commissionStatus,
      remark: item.remark ?? undefined,
    })
    setDrawerOpen(true)
  }

  const save = async () => {
    const values = await form.validateFields()
    const amountCents = Math.round(values.amountYuan * 100)
    const commissionCents = Math.round(values.commissionYuan * 100)
    if (commissionCents > amountCents) {
      message.error('导游提成不得大于增收金额')
      return
    }
    const next: IncomeRecord = {
      id: editing?.id ?? `ir-${Date.now()}`,
      type: values.type,
      projectName: values.projectName.trim(),
      partnerName: values.partnerName?.trim() || null,
      occurredOn: values.occurredOn.format('YYYY-MM-DD'),
      amountCents,
      guideName: values.guideName?.trim() || null,
      commissionCents,
      incomeStatus: values.incomeStatus,
      commissionStatus: values.commissionStatus,
      remark: values.remark?.trim() || null,
    }
    onChange(
      editing
        ? records.map((item) => (item.id === editing.id ? next : item))
        : [next, ...records],
    )
    message.success(editing ? '已更新（原型内存）' : '已新增（原型内存）')
    setDrawerOpen(false)
  }

  const patch = (id: string, patchValue: Partial<IncomeRecord>) => {
    onChange(records.map((item) => (item.id === id ? { ...item, ...patchValue } : item)))
  }

  const columns: TableColumnsType<IncomeRecord> = [
    {
      title: '增收类型',
      dataIndex: 'type',
      width: 120,
      render: (type: IncomeType) => INCOME_TYPE_LABELS[type],
    },
    {
      title: '项目名称',
      dataIndex: 'projectName',
      ellipsis: true,
    },
    {
      title: '合作方',
      dataIndex: 'partnerName',
      width: 140,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: '增收金额',
      dataIndex: 'amountCents',
      width: 120,
      align: 'right',
      render: (v: number) => formatCents(v),
    },
    {
      title: '导游',
      dataIndex: 'guideName',
      width: 90,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: '导游提成',
      dataIndex: 'commissionCents',
      width: 110,
      align: 'right',
      render: (v: number) => formatCents(v),
    },
    {
      title: '公司增收',
      key: 'company',
      width: 110,
      align: 'right',
      render: (_, row) => formatCents(companyIncomeCents(row)),
    },
    {
      title: '综合状态',
      key: 'composite',
      width: 110,
      render: (_, row) => {
        const key = settlementComposite(row)
        return <Tag color={COMPOSITE_COLORS[key]}>{SETTLEMENT_COMPOSITE_LABELS[key]}</Tag>
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_, row) => (
        <Space size={0} wrap>
          <Button type="link" size="small" onClick={() => openEdit(row)}>
            编辑
          </Button>
          {row.incomeStatus === 'uncollected' && (
            <Button
              type="link"
              size="small"
              onClick={() => {
                patch(row.id, { incomeStatus: 'collected' })
                message.success('已标记已收')
              }}
            >
              标记已收
            </Button>
          )}
          {row.commissionStatus === 'unpaid' && row.commissionCents > 0 && (
            <Button
              type="link"
              size="small"
              onClick={() => {
                patch(row.id, { commissionStatus: 'paid' })
                message.success('已标记已付')
              }}
            >
              标记已付
            </Button>
          )}
          <Popconfirm
            title="删除增收记录"
            description={
              row.incomeStatus === 'collected' || row.commissionStatus === 'paid'
                ? '该记录已有结算痕迹，确认删除？'
                : `确定删除「${row.projectName}」吗？`
            }
            okText="删除"
            okButtonProps={{ danger: true }}
            onConfirm={() => {
              onChange(records.filter((item) => item.id !== row.id))
              message.success('已删除（原型内存）')
            }}
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
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small">
        <Typography.Text type="secondary">
          方案 A · 完整字段表 + 抽屉录入（贴近现有发团详情密度）
        </Typography.Text>
        <Row gutter={24} style={{ marginTop: 12 }}>
          <Col span={8}>
            <Statistic title="增收金额合计" value={formatCents(summary.amountCents)} />
          </Col>
          <Col span={8}>
            <Statistic title="导游提成合计" value={formatCents(summary.commissionCents)} />
          </Col>
          <Col span={8}>
            <Statistic title="公司增收合计" value={formatCents(summary.companyCents)} />
          </Col>
        </Row>
      </Card>

      <Card
        size="small"
        title="增收记录"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增增收
          </Button>
        }
      >
        <Space wrap style={{ marginBottom: 12 }}>
          <Select
            style={{ width: 160 }}
            value={typeFilter}
            onChange={setTypeFilter}
            options={[{ value: 'all', label: '全部类型' }, ...TYPE_OPTIONS]}
          />
          <Select
            style={{ width: 160 }}
            value={compositeFilter}
            onChange={setCompositeFilter}
            options={[
              { value: 'all', label: '全部结算状态' },
              ...(Object.keys(SETTLEMENT_COMPOSITE_LABELS) as SettlementComposite[]).map(
                (value) => ({ value, label: SETTLEMENT_COMPOSITE_LABELS[value] }),
              ),
            ]}
          />
          <Input.Search
            allowClear
            placeholder="项目名称 / 备注 / 合作方"
            style={{ width: 240 }}
            onSearch={setKeyword}
            onChange={(e) => {
              if (!e.target.value) setKeyword('')
            }}
          />
        </Space>
        <Table
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 1200 }}
          pagination={false}
        />
      </Card>

      <Drawer
        title={editing ? '编辑增收记录' : '新增增收记录'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size={480}
        destroyOnHidden
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" onClick={() => void save()}>
              保存
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="type" label="增收类型" rules={[{ required: true }]}>
            <Select options={TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="projectName"
            label="项目名称"
            rules={[{ required: true, max: 50, message: '必填，最多 50 字' }]}
          >
            <Input placeholder="如：干果销售、游船票" maxLength={50} />
          </Form.Item>
          <Form.Item name="partnerName" label="合作方">
            <Select
              allowClear
              showSearch
              placeholder="从供应商选择（车销可空）"
              options={MOCK_PARTNERS.map((name) => ({ value: name, label: name }))}
            />
          </Form.Item>
          <Form.Item name="occurredOn" label="发生日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="amountYuan"
            label="增收金额"
            extra={watchedType ? INCOME_TYPE_AMOUNT_HINTS[watchedType] : undefined}
            rules={[{ required: true, type: 'number', min: 0 }]}
          >
            <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="¥" />
          </Form.Item>
          <Form.Item name="guideName" label="导游">
            <Select
              allowClear
              placeholder="本团已安排导游"
              options={MOCK_GUIDES.map((name) => ({ value: name, label: name }))}
            />
          </Form.Item>
          <Form.Item
            name="commissionYuan"
            label="导游提成"
            rules={[{ required: true, type: 'number', min: 0 }]}
          >
            <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="¥" />
          </Form.Item>
          <Form.Item shouldUpdate={(prev, next) =>
            prev.amountYuan !== next.amountYuan || prev.commissionYuan !== next.commissionYuan
          }>
            {() => {
              const amount = Number(form.getFieldValue('amountYuan') ?? 0)
              const commission = Number(form.getFieldValue('commissionYuan') ?? 0)
              return (
                <Form.Item label="公司增收">
                  <Typography.Text>{formatCents(Math.round((amount - commission) * 100))}</Typography.Text>
                </Form.Item>
              )
            }}
          </Form.Item>
          <Form.Item name="incomeStatus" label="收入状态" rules={[{ required: true }]}>
            <Select
              options={(Object.keys(INCOME_STATUS_LABELS) as IncomeStatus[]).map((value) => ({
                value,
                label: INCOME_STATUS_LABELS[value],
              }))}
            />
          </Form.Item>
          <Form.Item name="commissionStatus" label="提成状态" rules={[{ required: true }]}>
            <Select
              options={(Object.keys(COMMISSION_STATUS_LABELS) as CommissionStatus[]).map(
                (value) => ({
                  value,
                  label: COMMISSION_STATUS_LABELS[value],
                }),
              )}
            />
          </Form.Item>
          <Form.Item name="remark" label="备注" rules={[{ max: 200 }]}>
            <Input.TextArea rows={3} maxLength={200} showCount />
          </Form.Item>
        </Form>
      </Drawer>
    </Space>
  )
}
