/**
 * PROTOTYPE Variant C — 窄图标轨 + 资源矩阵
 *
 * 导航：极窄图标轨，业务/财务用分隔线分组，把内容宽留给执行区。
 * 执行：上方固定发团级资源条；下方是「种类 × 日期」矩阵，酒店/门票按天格子录入。
 */
import type { ReactNode } from 'react'
import {
  AppstoreOutlined,
  AuditOutlined,
  CarOutlined,
  DollarOutlined,
  FileTextOutlined,
  FundOutlined,
  ScheduleOutlined,
  TeamOutlined,
  TransactionOutlined,
} from '@ant-design/icons'
import { Button, Card, Flex, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined } from '@ant-design/icons'
import { formatYuan } from './mock-data'
import { PlaceholderPane, SectionTitle } from './shared'
import type { ProtoExecutionState, ProtoTabKey } from './types'
import { GROUP_LABELS, PROTO_TABS } from './types'
import styles from './detail-layout-prototype.module.css'

export const VARIANT_C_META = {
  key: 'C',
  label: '图标轨 · 种类×日期矩阵',
} as const

const TAB_ICONS: Record<ProtoTabKey, ReactNode> = {
  overview: <AppstoreOutlined />,
  sourceOrders: <TeamOutlined />,
  execution: <ScheduleOutlined />,
  incomeRecords: <FundOutlined />,
  receivables: <DollarOutlined />,
  payables: <AuditOutlined />,
  transactions: <TransactionOutlined />,
  verifications: <FileTextOutlined />,
}

type VariantCProps = {
  activeTab: ProtoTabKey
  onTabChange: (tab: ProtoTabKey) => void
  execution: ProtoExecutionState
  onExecutionChange: (next: ProtoExecutionState) => void
  onAddDepartureResource: () => void
  onAddSegmentResource: (segmentId?: string) => void
}

type MatrixRow = {
  key: string
  kind: string
  cells: Record<string, string>
}

export function VariantC({
  activeTab,
  onTabChange,
  execution,
  onAddDepartureResource,
  onAddSegmentResource,
}: VariantCProps) {
  return (
    <div className={`${styles.variantRoot} ${styles.iconRailLayout}`}>
      <aside className={styles.iconRail} aria-label="发团功能（原型）">
        {(['operations', 'finance'] as const).map((group) => (
          <div key={group} className={styles.iconRailGroup}>
            <div className={styles.iconRailGroupLabel}>{GROUP_LABELS[group]}</div>
            {PROTO_TABS.filter((tab) => tab.group === group).map((tab) => (
              <Tooltip key={tab.key} title={tab.label} placement="right">
                <button
                  type="button"
                  className={`${styles.iconRailItem} ${
                    activeTab === tab.key ? styles.iconRailItemActive : ''
                  }`}
                  onClick={() => onTabChange(tab.key)}
                  aria-label={tab.label}
                  aria-current={activeTab === tab.key ? 'page' : undefined}
                >
                  <span className={styles.iconRailIcon}>{TAB_ICONS[tab.key]}</span>
                  <span className={styles.iconRailText}>{tab.label}</span>
                </button>
              </Tooltip>
            ))}
          </div>
        ))}
      </aside>

      <div className={styles.variantBody}>
        {activeTab === 'execution' ? (
          <ExecutionC
            execution={execution}
            onAddDepartureResource={onAddDepartureResource}
            onAddSegmentResource={onAddSegmentResource}
          />
        ) : (
          <PlaceholderPane tab={activeTab} />
        )}
      </div>
    </div>
  )
}

function ExecutionC({
  execution,
  onAddDepartureResource,
  onAddSegmentResource,
}: {
  execution: ProtoExecutionState
  onAddDepartureResource: () => void
  onAddSegmentResource: (segmentId?: string) => void
}) {
  const kinds = ['酒店', '门票']
  const rows: MatrixRow[] = kinds.map((kind) => {
    const cells: Record<string, string> = {}
    for (const segment of execution.segments) {
      const matches = execution.segmentResources.filter(
        (item) => item.segmentId === segment.id && item.kind === kind,
      )
      cells[segment.id] =
        matches.length === 0
          ? ''
          : matches.map((item) => item.title.replace(/\s+/g, ' ')).join('；')
    }
    return { key: kind, kind, cells }
  })

  const columns: ColumnsType<MatrixRow> = [
    {
      title: '种类',
      dataIndex: 'kind',
      fixed: 'left',
      width: 72,
      render: (value: string) => <Tag>{value}</Tag>,
    },
    ...execution.segments.map((segment) => ({
      title: (
        <div className={styles.matrixHead}>
          <div>D{segment.dayIndex}</div>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {segment.date.slice(5)}
          </Typography.Text>
        </div>
      ),
      key: segment.id,
      width: 148,
      render: (_: unknown, row: MatrixRow) => {
        const text = row.cells[segment.id]
        if (!text) {
          return (
            <button
              type="button"
              className={styles.matrixEmptyCell}
              onClick={() => onAddSegmentResource(segment.id)}
            >
              + 录入
            </button>
          )
        }
        return (
          <div className={styles.matrixFilledCell} title={text}>
            {text}
          </div>
        )
      },
    })),
  ]

  return (
    <div className={styles.stackLayout}>
      <Card
        size="small"
        title={
          <Flex align="center" gap={8}>
            <CarOutlined />
            <span>发团级资源（全程统一）</span>
          </Flex>
        }
        extra={
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={onAddDepartureResource}
          >
            添加全程资源
          </Button>
        }
      >
        <Flex gap={8} wrap="wrap">
          {execution.departureResources.length === 0 ? (
            <Typography.Text type="secondary">暂无发团级资源</Typography.Text>
          ) : (
            execution.departureResources.map((item) => (
              <div key={item.id} className={styles.departureChip}>
                <Tag>{item.kind}</Tag>
                <span>{item.title}</span>
                <Typography.Text type="secondary">
                  {formatYuan(item.amountCents)}
                </Typography.Text>
              </div>
            ))
          )}
        </Flex>
      </Card>

      <Card size="small">
        <SectionTitle
          title="按日矩阵 · 酒店 / 门票"
          hint="列是日期，行是需按天录入的种类；空格一键补录。发团级不进矩阵。"
        />
        <Table
          rowKey="key"
          size="small"
          pagination={false}
          scroll={{ x: 72 + execution.segments.length * 148 }}
          columns={columns}
          dataSource={rows}
        />
      </Card>
    </div>
  )
}
