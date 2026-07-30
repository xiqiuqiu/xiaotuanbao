/**
 * PROTOTYPE Variant B — 业务/财务两级导航 + 日程时间轴
 *
 * 导航：先选「业务执行 / 财务处理」，再在组内用胶囊页签切换，减少 8 项平铺。
 * 执行：发团级资源固定在顶部折叠条；日程改为横向时间轴；主区只放当日资源。
 */
import { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Collapse,
  Flex,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import {
  countResourcesForSegment,
  formatYuan,
} from './mock-data'
import {
  PlaceholderPane,
  ResourceTable,
  SectionTitle,
  segmentMeta,
} from './shared'
import type {
  ProtoExecutionState,
  ProtoTabGroup,
  ProtoTabKey,
} from './types'
import { GROUP_LABELS, PROTO_TABS } from './types'
import styles from './detail-layout-prototype.module.css'

export const VARIANT_B_META = {
  key: 'B',
  label: '两级导航 · 横向日程轴',
} as const

type VariantBProps = {
  activeTab: ProtoTabKey
  onTabChange: (tab: ProtoTabKey) => void
  execution: ProtoExecutionState
  onExecutionChange: (next: ProtoExecutionState) => void
  onAddDepartureResource: () => void
  onAddSegmentResource: (segmentId?: string) => void
}

export function VariantB({
  activeTab,
  onTabChange,
  execution,
  onExecutionChange,
  onAddDepartureResource,
  onAddSegmentResource,
}: VariantBProps) {
  const activeGroup: ProtoTabGroup =
    PROTO_TABS.find((tab) => tab.key === activeTab)?.group ?? 'operations'

  const groupTabs = useMemo(
    () => PROTO_TABS.filter((tab) => tab.group === activeGroup),
    [activeGroup],
  )

  const handleGroupChange = (group: ProtoTabGroup) => {
    const first = PROTO_TABS.find((tab) => tab.group === group)
    if (first) onTabChange(first.key)
  }

  return (
    <div className={styles.variantRoot}>
      <div className={styles.twoLevelNav}>
        <Segmented
          value={activeGroup}
          options={[
            { label: GROUP_LABELS.operations, value: 'operations' },
            { label: GROUP_LABELS.finance, value: 'finance' },
          ]}
          onChange={(value) => handleGroupChange(value as ProtoTabGroup)}
        />
        <Flex gap={8} wrap="wrap" className={styles.pillRow}>
          {groupTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`${styles.pill} ${
                activeTab === tab.key ? styles.pillActive : ''
              }`}
              onClick={() => onTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </Flex>
      </div>

      <div className={styles.variantBody}>
        {activeTab === 'execution' ? (
          <ExecutionB
            execution={execution}
            onExecutionChange={onExecutionChange}
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

/** Shared by Variant B / D — 发团级折叠条 + 横向日程轴 + 当日资源 */
export function ExecutionB({
  execution,
  onExecutionChange,
  onAddDepartureResource,
  onAddSegmentResource,
}: {
  execution: ProtoExecutionState
  onExecutionChange: (next: ProtoExecutionState) => void
  onAddDepartureResource: () => void
  onAddSegmentResource: (segmentId?: string) => void
}) {
  const [groupOpen, setGroupOpen] = useState(true)
  const selectedId = execution.selectedSegmentId ?? execution.segments[0]?.id
  const selected = selectedId ? segmentMeta(execution, selectedId) : null
  const depTotal = execution.departureResources.reduce(
    (sum, item) => sum + item.amountCents,
    0,
  )

  return (
    <div className={styles.stackLayout}>
      <Collapse
        activeKey={groupOpen ? ['departure'] : []}
        onChange={(keys) => setGroupOpen(keys.includes('departure'))}
        items={[
          {
            key: 'departure',
            label: (
              <Space size={12} wrap>
                <Typography.Text strong>发团级资源（全程）</Typography.Text>
                <Tag color="blue">{execution.departureResources.length} 项</Tag>
                <Typography.Text type="secondary">
                  合计 {formatYuan(depTotal)}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  用车 / 保险 / 导游 — 与按天录入分开
                </Typography.Text>
              </Space>
            ),
            extra: (
              <Button
                size="small"
                type="primary"
                icon={<PlusOutlined />}
                onClick={(event) => {
                  event.stopPropagation()
                  onAddDepartureResource()
                }}
              >
                添加
              </Button>
            ),
            children: (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={execution.departureResources}
                columns={[
                  { title: '种类', dataIndex: 'kind', width: 88 },
                  { title: '项目', dataIndex: 'title' },
                  { title: '供应商', dataIndex: 'supplier', width: 140 },
                  {
                    title: '金额',
                    dataIndex: 'amountCents',
                    width: 120,
                    align: 'right',
                    render: (value: number) => formatYuan(value),
                  },
                ]}
                locale={{ emptyText: '暂无发团级资源' }}
              />
            ),
          },
        ]}
      />

      <Card size="small" title="按日资源（酒店 / 门票）">
        <div className={styles.timeline}>
          {execution.segments.map((segment) => {
            const count = countResourcesForSegment(execution, segment.id)
            const active = selectedId === segment.id
            return (
              <button
                key={segment.id}
                type="button"
                className={`${styles.timelineChip} ${
                  active ? styles.timelineChipActive : ''
                }`}
                onClick={() =>
                  onExecutionChange({
                    ...execution,
                    focus: 'segment',
                    selectedSegmentId: segment.id,
                  })
                }
              >
                <div className={styles.timelineDay}>D{segment.dayIndex}</div>
                <div className={styles.timelineDate}>{segment.date.slice(5)}</div>
                <div className={styles.timelineCount}>
                  {count > 0 ? `${count} 项` : '空'}
                </div>
              </button>
            )
          })}
        </div>

        {selected?.segment ? (
          <>
            <SectionTitle
              title={`第${selected.segment.dayIndex}天 · ${selected.segment.overview}`}
              hint={`${selected.segment.date} · 仅展示本段资源，发团级已在上方统一维护`}
            />
            <ResourceTable
              resources={selected.resources}
              emptyText="本段暂无酒店/门票等资源"
              onAdd={onAddSegmentResource}
            />
          </>
        ) : null}
      </Card>
    </div>
  )
}
