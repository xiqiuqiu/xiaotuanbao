/**
 * PROTOTYPE Variant C — 类型优先录入台
 * 信息架构：先选增收类型（大块入口），再在该类型上下文中看列表 + 内联表单。
 * 主路径是「今天登一笔什么类型的增收」，不是扫全表。
 */
import { useMemo, useState } from 'react'
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableColumnsType } from 'antd'
import dayjs from 'dayjs'
import { formatCents } from '../../catalog'
import { MOCK_GUIDES, MOCK_PARTNERS } from './mock-data'
import {
  INCOME_TYPE_AMOUNT_HINTS,
  INCOME_TYPE_LABELS,
  SETTLEMENT_COMPOSITE_LABELS,
  companyIncomeCents,
  settlementComposite,
  summarizeRecords,
  type IncomeRecord,
  type IncomeType,
} from './types'

export const VARIANT_C_META = {
  key: 'C',
  label: '类型优先录入台',
} as const

type VariantCProps = {
  records: IncomeRecord[]
  onChange: (records: IncomeRecord[]) => void
}

type FormValues = {
  projectName: string
  partnerName?: string
  occurredOn: dayjs.Dayjs
  amountYuan: number
  guideName?: string
  commissionYuan: number
  remark?: string
}

const TYPE_ORDER: IncomeType[] = [
  'shopping_rebate',
  'coach_sales',
  'optional_tour',
  'other',
]

const TYPE_BLURB: Record<IncomeType, string> = {
  shopping_rebate: '特产店 / 玉石店等返款',
  coach_sales: '车上商品销售，合作方可空',
  optional_tour: '游船、演出等项目返利',
  other: '无法归类的临时收益',
}

export function VariantC({ records, onChange }: VariantCProps) {
  const { message } = App.useApp()
  const [activeType, setActiveType] = useState<IncomeType>('shopping_rebate')
  const [form] = Form.useForm<FormValues>()
  const [formOpen, setFormOpen] = useState(false)

  const typeCounts = useMemo(() => {
    const counts = Object.fromEntries(TYPE_ORDER.map((t) => [t, 0])) as Record<IncomeType, number>
    for (const item of records) counts[item.type] += 1
    return counts
  }, [records])

  const scoped = records.filter((item) => item.type === activeType)
  const summary = summarizeRecords(scoped)
  const allSummary = summarizeRecords(records)

  const submit = async () => {
    const values = await form.validateFields()
    const amountCents = Math.round(values.amountYuan * 100)
    const commissionCents = Math.round((values.commissionYuan ?? 0) * 100)
    if (commissionCents > amountCents) {
      message.error('导游提成不得大于增收金额')
      return
    }
    if (
      (activeType === 'shopping_rebate' || activeType === 'optional_tour') &&
      !values.partnerName
    ) {
      message.warning('该类型建议填写合作方（原型仍允许保存）')
    }
    const next: IncomeRecord = {
      id: `ir-${Date.now()}`,
      type: activeType,
      projectName: values.projectName.trim(),
      partnerName: values.partnerName?.trim() || null,
      occurredOn: values.occurredOn.format('YYYY-MM-DD'),
      amountCents,
      guideName: values.guideName?.trim() || null,
      commissionCents,
      incomeStatus: 'uncollected',
      commissionStatus: 'unpaid',
      remark: values.remark?.trim() || null,
    }
    onChange([next, ...records])
    form.resetFields()
    form.setFieldsValue({ occurredOn: dayjs(), commissionYuan: 0 })
    setFormOpen(false)
    message.success(`已记入「${INCOME_TYPE_LABELS[activeType]}」（原型内存）`)
  }

  const columns: TableColumnsType<IncomeRecord> = [
    { title: '项目', dataIndex: 'projectName', ellipsis: true },
    {
      title: '合作方',
      dataIndex: 'partnerName',
      width: 140,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: '增收',
      dataIndex: 'amountCents',
      width: 110,
      align: 'right',
      render: (v: number) => formatCents(v),
    },
    {
      title: '提成',
      dataIndex: 'commissionCents',
      width: 100,
      align: 'right',
      render: (v: number) => formatCents(v),
    },
    {
      title: '公司',
      key: 'company',
      width: 100,
      align: 'right',
      render: (_, row) => formatCents(companyIncomeCents(row)),
    },
    {
      title: '状态',
      key: 'composite',
      width: 100,
      render: (_, row) => (
        <Tag>{SETTLEMENT_COMPOSITE_LABELS[settlementComposite(row)]}</Tag>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small">
        <Typography.Text type="secondary">
          方案 C · 类型优先（计调「先定类型再登一笔」；全团合计仅作背景）
        </Typography.Text>
        <Row gutter={16} style={{ marginTop: 12 }}>
          <Col span={8}>
            <Statistic title="全团公司增收" value={formatCents(allSummary.companyCents)} />
          </Col>
          <Col span={8}>
            <Statistic title="当前类型笔数" value={scoped.length} />
          </Col>
          <Col span={8}>
            <Statistic title="当前类型公司增收" value={formatCents(summary.companyCents)} />
          </Col>
        </Row>
      </Card>

      <Row gutter={12}>
        {TYPE_ORDER.map((type) => {
          const active = type === activeType
          return (
            <Col span={6} key={type}>
              <button
                type="button"
                onClick={() => {
                  setActiveType(type)
                  setFormOpen(false)
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: active ? '2px solid #1677ff' : '1px solid #d9d9d9',
                  background: active ? '#e6f4ff' : '#fff',
                  borderRadius: 8,
                  padding: '14px 16px',
                  cursor: 'pointer',
                  minHeight: 96,
                }}
              >
                <Typography.Title level={5} style={{ margin: 0 }}>
                  {INCOME_TYPE_LABELS[type]}
                </Typography.Title>
                <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0', fontSize: 12 }}>
                  {TYPE_BLURB[type]}
                </Typography.Paragraph>
                <Tag style={{ marginTop: 8 }}>{typeCounts[type]} 笔</Tag>
              </button>
            </Col>
          )
        })}
      </Row>

      <Card
        size="small"
        title={`${INCOME_TYPE_LABELS[activeType]} · 本团记录`}
        extra={
          <Button
            type="primary"
            onClick={() => {
              form.setFieldsValue({
                occurredOn: dayjs(),
                commissionYuan: 0,
                projectName: undefined,
                partnerName: undefined,
                amountYuan: undefined,
                guideName: undefined,
                remark: undefined,
              })
              setFormOpen(true)
            }}
          >
            登记一笔{INCOME_TYPE_LABELS[activeType]}
          </Button>
        }
      >
        {formOpen ? (
          <Card
            size="small"
            type="inner"
            title={`录入 · ${INCOME_TYPE_LABELS[activeType]}`}
            style={{ marginBottom: 16 }}
            extra={
              <Space>
                <Button size="small" onClick={() => setFormOpen(false)}>
                  收起
                </Button>
                <Button size="small" type="primary" onClick={() => void submit()}>
                  保存到本类型
                </Button>
              </Space>
            }
          >
            <Form form={form} layout="vertical">
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item
                    name="projectName"
                    label="项目名称"
                    rules={[{ required: true, max: 50 }]}
                  >
                    <Input maxLength={50} placeholder="项目名称" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="partnerName"
                    label="合作方"
                    extra={
                      activeType === 'coach_sales' ? '车销允许为空' : '建议从供应商选择'
                    }
                  >
                    <Select
                      allowClear
                      showSearch
                      options={MOCK_PARTNERS.map((name) => ({ value: name, label: name }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="occurredOn" label="发生日期">
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="amountYuan"
                    label="增收金额"
                    extra={INCOME_TYPE_AMOUNT_HINTS[activeType]}
                    rules={[{ required: true, type: 'number', min: 0 }]}
                  >
                    <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="¥" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="commissionYuan" label="导游提成" rules={[{ required: true }]}>
                    <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="¥" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="guideName" label="导游">
                    <Select
                      allowClear
                      options={MOCK_GUIDES.map((name) => ({ value: name, label: name }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="remark" label="备注">
                    <Input maxLength={200} />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </Card>
        ) : null}

        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={scoped}
          pagination={false}
          locale={{ emptyText: `暂无「${INCOME_TYPE_LABELS[activeType]}」记录` }}
        />
      </Card>
    </Space>
  )
}
