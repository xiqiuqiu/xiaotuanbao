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
  ProtoResourceDrawer,
  type ProtoResourceDraft,
} from './ProtoResourceDrawer'
import {
  buildProtoResourceColumns,
  PlaceholderPane,
  ResourceTable,
  SectionTitle,
  segmentMeta,
} from './shared'
import type {
  ProtoExecutionState,
  ProtoResource,
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

type DrawerState = {
  open: boolean
  scope: 'departure' | 'segment'
  editing: ProtoResource | null
}

/** Shared by Variant B / D — 发团级折叠条 + 横向日程轴 + 当日资源；属性进抽屉 */
export function ExecutionB({
  execution,
  onExecutionChange,
}: {
  execution: ProtoExecutionState
  onExecutionChange: (next: ProtoExecutionState) => void
  /** kept for host wiring compatibility; drawer owns create/edit now */
  onAddDepartureResource?: () => void
  onAddSegmentResource?: (segmentId?: string) => void
}) {
  const [groupOpen, setGroupOpen] = useState(true)
  const [drawer, setDrawer] = useState<DrawerState>({
    open: false,
    scope: 'departure',
    editing: null,
  })
  const selectedId = execution.selectedSegmentId ?? execution.segments[0]?.id
  const selected = selectedId ? segmentMeta(execution, selectedId) : null
  const depTotal = execution.departureResources.reduce(
    (sum, item) => sum + item.amountCents,
    0,
  )

  const openDepartureDrawer = (editing: ProtoResource | null = null) => {
    setDrawer({ open: true, scope: 'departure', editing })
  }

  const openSegmentDrawer = (editing: ProtoResource | null = null) => {
    setDrawer({ open: true, scope: 'segment', editing })
  }

  const handleSave = (
    draft: ProtoResourceDraft,
    options?: { generatePayable?: boolean },
  ) => {
    const amountCents = Math.round(draft.amountYuan * 100)
    const now = '2026-07-30 10:00'
    if (drawer.editing) {
      const patch = (item: ProtoResource): ProtoResource =>
        item.id === drawer.editing!.id
          ? {
              ...item,
              kind: draft.kind,
              title: draft.title,
              supplier: draft.supplier,
              amountCents,
              notes: draft.notes,
              updatedAt: now,
              payableStatus: options?.generatePayable
                ? 'pending'
                : item.payableStatus,
            }
          : item
      onExecutionChange({
        ...execution,
        departureResources: execution.departureResources.map(patch),
        segmentResources: execution.segmentResources.map(patch),
      })
    } else if (drawer.scope === 'departure') {
      onExecutionChange({
        ...execution,
        focus: 'departure',
        departureResources: [
          ...execution.departureResources,
          {
            id: `dr-new-${Date.now()}`,
            kind: draft.kind,
            title: draft.title,
            supplier: draft.supplier,
            amountCents,
            notes: draft.notes,
            scope: 'departure',
            payableStatus: options?.generatePayable ? 'pending' : 'not_generated',
            createdAt: now,
            updatedAt: now,
          },
        ],
      })
    } else if (selectedId) {
      onExecutionChange({
        ...execution,
        focus: 'segment',
        selectedSegmentId: selectedId,
        segmentResources: [
          ...execution.segmentResources,
          {
            id: `sr-new-${Date.now()}`,
            kind: draft.kind,
            title: draft.title,
            supplier: draft.supplier,
            amountCents,
            notes: draft.notes,
            scope: 'segment',
            segmentId: selectedId,
            payableStatus: options?.generatePayable ? 'pending' : 'not_generated',
            createdAt: now,
            updatedAt: now,
          },
        ],
      })
    }
    setDrawer({ open: false, scope: 'departure', editing: null })
  }

  const scopeLabel = selected?.segment
    ? `第${selected.segment.dayIndex}天 · ${selected.segment.overview}`
    : '本段资源'

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
                  列表扫一眼；点「添加 / 编辑」在抽屉录全量属性
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
                  openDepartureDrawer()
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
                scroll={{ x: 1200 }}
                onRow={(record) => ({
                  onClick: () => openDepartureDrawer(record),
                  style: { cursor: 'pointer' },
                })}
                columns={buildProtoResourceColumns({
                  onEdit: openDepartureDrawer,
                })}
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
              title={`第${selected.segment.dayIndex}天 · 资源安排`}
              hint={`${selected.segment.date} · ${selected.segment.overview}`}
            />
            <ResourceTable
              resources={selected.resources}
              emptyText="本段暂无酒店/门票等资源"
              onAdd={() => openSegmentDrawer()}
              onEdit={(resource) => openSegmentDrawer(resource)}
              showSummary
            />
          </>
        ) : null}
      </Card>

      <ProtoResourceDrawer
        open={drawer.open}
        scope={drawer.scope}
        scopeLabel={scopeLabel}
        editing={drawer.editing}
        onClose={() => setDrawer({ open: false, scope: 'departure', editing: null })}
        onSave={handleSave}
      />
    </div>
  )
}
