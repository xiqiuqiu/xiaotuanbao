/**
 * PROTOTYPE helpers — shared stub panes only. Do not reuse layouts across variants.
 */
import type { ReactNode } from 'react'
import { Button, Empty, Space, Table, Tag, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import {
  countResourcesForSegment,
  formatYuan,
  resourcesForSegment,
} from './mock-data'
import type { ProtoExecutionState, ProtoResource, ProtoTabKey } from './types'
import { PROTO_TABS } from './types'

export function tabLabel(key: ProtoTabKey): string {
  return PROTO_TABS.find((tab) => tab.key === key)?.label ?? key
}

export function PlaceholderPane({ tab }: { tab: ProtoTabKey }) {
  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        <span>
          「{tabLabel(tab)}」占位 — 本原型只对比<strong>导航位置</strong>与
          <strong>执行安排布局</strong>，其它页签不渲染真内容。
        </span>
      }
      style={{ padding: '64px 0' }}
    />
  )
}

const RESOURCE_COLUMNS: ColumnsType<ProtoResource> = [
  { title: '种类', dataIndex: 'kind', width: 88 },
  { title: '项目', dataIndex: 'title', ellipsis: true },
  { title: '供应商', dataIndex: 'supplier', width: 140, ellipsis: true },
  {
    title: '金额',
    dataIndex: 'amountCents',
    width: 120,
    align: 'right',
    render: (value: number) => formatYuan(value),
  },
]

export function ResourceTable({
  resources,
  emptyText,
  onAdd,
}: {
  resources: ProtoResource[]
  emptyText: string
  onAdd?: () => void
}) {
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
      {onAdd ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
            添加资源
          </Button>
        </div>
      ) : null}
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        columns={RESOURCE_COLUMNS}
        dataSource={resources}
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
