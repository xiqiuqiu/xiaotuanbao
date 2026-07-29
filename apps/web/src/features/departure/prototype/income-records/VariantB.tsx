/**
 * PROTOTYPE Variant B — 结算泳道
 * 信息架构：以综合结算态为主轴（待结算 / 待付提成 / 待收增收 / 已结算），
 * 主操作是「推进结算」，列表浏览退居次要。
 */
import { useMemo, useState } from 'react'
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
} from 'antd'
import { formatCents } from '../../catalog'
import {
  INCOME_TYPE_LABELS,
  SETTLEMENT_COMPOSITE_LABELS,
  companyIncomeCents,
  settlementComposite,
  summarizeRecords,
  type IncomeRecord,
  type IncomeType,
  type SettlementComposite,
} from './types'

export const VARIANT_B_META = {
  key: 'B',
  label: '结算泳道推进',
} as const

type VariantBProps = {
  records: IncomeRecord[]
  onChange: (records: IncomeRecord[]) => void
}

const LANES: SettlementComposite[] = [
  'pending_settle',
  'pending_commission',
  'pending_collect',
  'settled',
]

const LANE_HINT: Record<SettlementComposite, string> = {
  pending_settle: '收入未收 · 提成未付',
  pending_commission: '收入已收 · 提成未付',
  pending_collect: '提成已付 · 收入未收',
  settled: '双边均已结清',
}

export function VariantB({ records, onChange }: VariantBProps) {
  const { message } = App.useApp()
  const [typeFilter, setTypeFilter] = useState<IncomeType | 'all'>('all')
  const [keyword, setKeyword] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(records[0]?.id ?? null)

  const summary = summarizeRecords(records)

  const filtered = useMemo(() => {
    return records.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false
      if (keyword.trim()) {
        const q = keyword.trim()
        const hay = `${item.projectName} ${item.remark ?? ''} ${item.partnerName ?? ''}`
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [records, typeFilter, keyword])

  const byLane = useMemo(() => {
    const map = Object.fromEntries(LANES.map((lane) => [lane, [] as IncomeRecord[]])) as Record<
      SettlementComposite,
      IncomeRecord[]
    >
    for (const item of filtered) {
      map[settlementComposite(item)].push(item)
    }
    return map
  }, [filtered])

  const selected = records.find((item) => item.id === selectedId) ?? null

  const patch = (id: string, patchValue: Partial<IncomeRecord>) => {
    onChange(records.map((item) => (item.id === id ? { ...item, ...patchValue } : item)))
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small">
        <Typography.Text type="secondary">
          方案 B · 结算状态泳道（财务跟进优先，不是完整字段表）
        </Typography.Text>
        <Row gutter={24} style={{ marginTop: 12 }}>
          <Col span={6}>
            <Statistic title="待处理笔数" value={records.filter((r) => settlementComposite(r) !== 'settled').length} />
          </Col>
          <Col span={6}>
            <Statistic title="增收金额合计" value={formatCents(summary.amountCents)} />
          </Col>
          <Col span={6}>
            <Statistic title="导游提成合计" value={formatCents(summary.commissionCents)} />
          </Col>
          <Col span={6}>
            <Statistic title="公司增收合计" value={formatCents(summary.companyCents)} />
          </Col>
        </Row>
        <Space wrap style={{ marginTop: 12 }}>
          <Select
            style={{ width: 160 }}
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: 'all', label: '全部类型' },
              ...(Object.keys(INCOME_TYPE_LABELS) as IncomeType[]).map((value) => ({
                value,
                label: INCOME_TYPE_LABELS[value],
              })),
            ]}
          />
          <Input.Search
            allowClear
            placeholder="搜索项目 / 合作方"
            style={{ width: 220 }}
            onSearch={setKeyword}
            onChange={(e) => {
              if (!e.target.value) setKeyword('')
            }}
          />
        </Space>
      </Card>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(200px, 1fr))',
          gap: 12,
          alignItems: 'start',
        }}
      >
        {LANES.map((lane) => (
          <Card
            key={lane}
            size="small"
            title={
              <Flex justify="space-between" align="center">
                <span>{SETTLEMENT_COMPOSITE_LABELS[lane]}</span>
                <Tag>{byLane[lane].length}</Tag>
              </Flex>
            }
            styles={{ body: { padding: 8, minHeight: 280, background: '#fafafa' } }}
          >
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '0 0 8px' }}>
              {LANE_HINT[lane]}
            </Typography.Paragraph>
            {byLane[lane].length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无记录" />
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {byLane[lane].map((item) => {
                  const active = item.id === selectedId
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        border: active ? '1px solid #1677ff' : '1px solid #f0f0f0',
                        background: '#fff',
                        borderRadius: 8,
                        padding: 10,
                        cursor: 'pointer',
                      }}
                    >
                      <Typography.Text strong>{item.projectName}</Typography.Text>
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {INCOME_TYPE_LABELS[item.type]}
                          {item.partnerName ? ` · ${item.partnerName}` : ''}
                        </Typography.Text>
                      </div>
                      <Flex justify="space-between" style={{ marginTop: 6 }}>
                        <Typography.Text>{formatCents(item.amountCents)}</Typography.Text>
                        <Typography.Text type="secondary">
                          提成 {formatCents(item.commissionCents)}
                        </Typography.Text>
                      </Flex>
                    </button>
                  )
                })}
              </Space>
            )}
          </Card>
        ))}
      </div>

      <Card
        size="small"
        title={selected ? `选中：${selected.projectName}` : '选中一条记录以推进结算'}
      >
        {!selected ? (
          <Empty description="点击泳道中的记录" />
        ) : (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              合作方 {selected.partnerName ?? '—'} · 导游 {selected.guideName ?? '—'} · 公司增收{' '}
              {formatCents(companyIncomeCents(selected))}
            </Typography.Paragraph>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              收入状态：{selected.incomeStatus === 'collected' ? '已收' : '未收'}　｜　提成状态：
              {selected.commissionStatus === 'paid' ? '已付' : '未付'}　｜　综合：
              {SETTLEMENT_COMPOSITE_LABELS[settlementComposite(selected)]}
            </Typography.Paragraph>
            {selected.remark ? (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                备注：{selected.remark}
              </Typography.Paragraph>
            ) : null}
            <Space wrap>
              {selected.incomeStatus === 'uncollected' && (
                <Button
                  type="primary"
                  onClick={() => {
                    patch(selected.id, { incomeStatus: 'collected' })
                    message.success('已标记已收 → 可能进入待付提成')
                  }}
                >
                  标记已收
                </Button>
              )}
              {selected.commissionStatus === 'unpaid' && (
                <Button
                  onClick={() => {
                    patch(selected.id, { commissionStatus: 'paid' })
                    message.success('已标记已付 → 可能进入待收增收 / 已结算')
                  }}
                >
                  标记已付提成
                </Button>
              )}
              {settlementComposite(selected) === 'settled' && (
                <Tag color="success">无需再操作</Tag>
              )}
            </Space>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
              当前内存状态：{JSON.stringify({
                id: selected.id,
                incomeStatus: selected.incomeStatus,
                commissionStatus: selected.commissionStatus,
                composite: settlementComposite(selected),
              })}
            </Typography.Paragraph>
          </Space>
        )}
      </Card>
    </Space>
  )
}
