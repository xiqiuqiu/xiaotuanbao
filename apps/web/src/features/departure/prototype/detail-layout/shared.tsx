/**
 * PROTOTYPE helpers — shared stub panes only. Do not reuse layouts across variants.
 */
import type { ReactNode } from 'react'
import { Button, Empty, Flex, Space, Table, Tag, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import {
  countResourcesForSegment,
  formatYuan,
  PAYABLE_STATUS_LABELS,
  payableStatusTagColor,
  resourcesForSegment,
} from './mock-data'
import type {
  ProtoExecutionState,
  ProtoPayableStatus,
  ProtoResource,
  ProtoTabKey,
} from './types'
import { PROTO_TABS } from './types'
import styles from './detail-layout-prototype.module.css'

export function tabLabel(key: ProtoTabKey): string {
  return PROTO_TABS.find((tab) => tab.key === key)?.label ?? key
}

export function PlaceholderPane({ tab }: { tab: ProtoTabKey }) {
  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={`「${tabLabel(tab)}」内容区`}
      style={{ padding: '64px 0' }}
    />
  )
}

/** Match production 资源安排 columns (execution-resource-columns). */
export function buildProtoResourceColumns(options?: {
  onEdit?: (resource: ProtoResource) => void
}): ColumnsType<ProtoResource> {
  const onEdit = options?.onEdit
  return [
    {
      title: '资源种类',
      dataIndex: 'kind',
      width: 90,
    },
    {
      title: '供应商',
      dataIndex: 'supplier',
      width: 140,
      ellipsis: true,
    },
    {
      title: '资源名称',
      dataIndex: 'title',
      width: 200,
      render: (value: string, record: ProtoResource) => (
        <Space size={6} wrap>
          <span>{value || '-'}</span>
          {record.pendingCheck ? (
            <Tag color="warning" style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: '16px', paddingInline: 4 }}>
              待检查
            </Tag>
          ) : null}
        </Space>
      ),
    },
    {
      title: '资源金额',
      dataIndex: 'amountCents',
      width: 110,
      align: 'right',
      render: (value: number) => formatYuan(value),
    },
    {
      title: '应付状态',
      dataIndex: 'payableStatus',
      width: 100,
      render: (value: ProtoPayableStatus) => (
        <Tag color={payableStatusTagColor(value)}>{PAYABLE_STATUS_LABELS[value]}</Tag>
      ),
    },
    {
      title: '备注',
      dataIndex: 'notes',
      ellipsis: true,
      width: 140,
      render: (value: string | undefined) => value || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 150,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 150,
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_: unknown, record: ProtoResource) => {
        const generated = record.payableStatus !== 'not_generated'
        return (
          <Space size={0} wrap>
            <Button
              type="link"
              size="small"
              onClick={(event) => {
                event.stopPropagation()
                onEdit?.(record)
              }}
            >
              编辑
            </Button>
            {generated ? (
              <>
                <Button type="link" size="small" onClick={(event) => event.stopPropagation()}>
                  查看应付
                </Button>
                <Button
                  type="link"
                  size="small"
                  danger
                  onClick={(event) => event.stopPropagation()}
                >
                  作废应付
                </Button>
              </>
            ) : (
              <Button type="link" size="small" onClick={(event) => event.stopPropagation()}>
                生成应付
              </Button>
            )}
          </Space>
        )
      },
    },
  ]
}

export function summarizeProtoResourceAmounts(resources: ProtoResource[]) {
  let resourceAmountCents = 0
  let ungeneratedPayableCents = 0
  for (const item of resources) {
    resourceAmountCents += item.amountCents
    if (item.payableStatus === 'not_generated' && item.amountCents > 0) {
      ungeneratedPayableCents += item.amountCents
    }
  }
  return {
    resourceCount: resources.length,
    resourceAmountCents,
    ungeneratedPayableCents,
  }
}

/** Align production ExecutionResourceHeader / DepartureResourceHeader summary. */
export function ResourceAmountSummary({ resources }: { resources: ProtoResource[] }) {
  if (resources.length === 0) return null
  const { resourceCount, resourceAmountCents, ungeneratedPayableCents } =
    summarizeProtoResourceAmounts(resources)
  return (
    <Typography.Text type="secondary" aria-label="资源金额汇总" style={{ fontSize: 13 }}>
      资源 {resourceCount} 项 ｜ 资源金额{' '}
      <Typography.Text strong>{formatYuan(resourceAmountCents)}</Typography.Text>
      {ungeneratedPayableCents > 0 ? (
        <>
          {' ｜ 尚未生成应付 '}
          <Typography.Text
            strong
            style={{ color: 'var(--ant-color-warning, #faad14)' }}
          >
            {formatYuan(ungeneratedPayableCents)}
          </Typography.Text>
        </>
      ) : null}
    </Typography.Text>
  )
}

/** Whole-trip cost glance above split 发团级 / 按日 blocks. */
export function ExecutionCostStrip({
  departureResources,
  segmentResources,
}: {
  departureResources: ProtoResource[]
  segmentResources: ProtoResource[]
}) {
  const departure = summarizeProtoResourceAmounts(departureResources)
  const segment = summarizeProtoResourceAmounts(segmentResources)
  const totalCents = departure.resourceAmountCents + segment.resourceAmountCents
  const totalCount = departure.resourceCount + segment.resourceCount
  const ungenerated =
    departure.ungeneratedPayableCents + segment.ungeneratedPayableCents
  if (totalCount === 0) return null

  return (
    <div className={styles.costStrip} aria-label="整团成本汇总" role="list">
      <div className={`${styles.costStripCell} ${styles.costStripHero}`} role="listitem">
        <span className={styles.costStripLabel}>成本合计</span>
        <span className={styles.costStripTotal}>{formatYuan(totalCents)}</span>
        <span className={styles.costStripCount}>{totalCount} 项资源</span>
      </div>
      <div className={styles.costStripCell} role="listitem">
        <span className={styles.costStripLabel}>发团级</span>
        <span className={styles.costStripMetricValue}>
          {formatYuan(departure.resourceAmountCents)}
        </span>
        <span className={styles.costStripCount}>{departure.resourceCount} 项</span>
      </div>
      <div className={styles.costStripCell} role="listitem">
        <span className={styles.costStripLabel}>按日</span>
        <span className={styles.costStripMetricValue}>
          {formatYuan(segment.resourceAmountCents)}
        </span>
        <span className={styles.costStripCount}>{segment.resourceCount} 项</span>
      </div>
      <div
        className={`${styles.costStripCell} ${
          ungenerated > 0 ? styles.costStripMetricWarn : ''
        }`}
        role="listitem"
      >
        <span className={styles.costStripLabel}>尚未生成应付</span>
        <span className={styles.costStripMetricValue}>
          {formatYuan(ungenerated)}
        </span>
        <span className={styles.costStripCount}>
          {ungenerated > 0 ? '待生成' : '已齐'}
        </span>
      </div>
    </div>
  )
}

export function ResourceTable({
  resources,
  emptyText,
  onAdd,
  onEdit,
  showSummary = false,
}: {
  resources: ProtoResource[]
  emptyText: string
  onAdd?: () => void
  onEdit?: (resource: ProtoResource) => void
  showSummary?: boolean
}) {
  const columns = buildProtoResourceColumns({ onEdit })

  if (resources.length === 0) {
    return (
      <Empty description={emptyText} style={{ padding: '32px 0' }}>
        {onAdd ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
            添加资源
          </Button>
        ) : null}
      </Empty>
    )
  }

  return (
    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
      <Flex align="center" justify="space-between" gap={12} wrap="wrap">
        {showSummary ? <ResourceAmountSummary resources={resources} /> : <span />}
        {onAdd ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
            添加资源
          </Button>
        ) : null}
      </Flex>
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        columns={columns}
        dataSource={resources}
        scroll={{ x: 1200 }}
        onRow={
          onEdit
            ? (record) => ({
                onClick: () => onEdit(record),
                style: { cursor: 'pointer' },
              })
            : undefined
        }
      />
    </Space>
  )
}

export function segmentMeta(state: ProtoExecutionState, segmentId: string) {
  const segment = state.segments.find((item) => item.id === segmentId)
  const count = countResourcesForSegment(state, segmentId)
  return { segment, count, resources: resourcesForSegment(state, segmentId) }
}

export function KindTag({ kind }: { kind: string }) {
  return <Tag>{kind}</Tag>
}

export function SectionTitle({
  title,
  hint,
  extra,
}: {
  title: string
  hint?: string
  extra?: ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 12,
      }}
    >
      <div>
        <Typography.Text strong>{title}</Typography.Text>
        {hint ? (
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {hint}
            </Typography.Text>
          </div>
        ) : null}
      </div>
      {extra}
    </div>
  )
}
