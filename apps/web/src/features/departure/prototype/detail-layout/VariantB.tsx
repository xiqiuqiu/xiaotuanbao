/**
 * PROTOTYPE Variant B — 业务/财务两级导航 + 日程时间轴
 *
 * 导航：先选「业务执行 / 财务处理」，再在组内用胶囊页签切换，减少 8 项平铺。
 * 执行：发团级资源固定在顶部折叠条；日程改为横向时间轴；主区只放当日资源。
 */
import { useMemo, useState } from 'react'
import {
  Button,
  Collapse,
  Empty,
  Flex,
  Modal,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { CloseOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
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
  ResourceAmountSummary,
  ResourceTable,
  segmentMeta,
} from './shared'
import type {
  ProtoExecutionState,
  ProtoResource,
  ProtoSegment,
  ProtoTabGroup,
  ProtoTabKey,
} from './types'
import { GROUP_LABELS, PROTO_TABS } from './types'
import styles from './detail-layout-prototype.module.css'

function renumberSegments(segments: ProtoSegment[]): ProtoSegment[] {
  return segments.map((segment, index) => ({
    ...segment,
    dayIndex: index + 1,
  }))
}

function addSegmentDay(state: ProtoExecutionState): ProtoExecutionState {
  const last = state.segments[state.segments.length - 1]
  const nextDate = last
    ? dayjs(last.date).add(1, 'day').format('YYYY-MM-DD')
    : dayjs().format('YYYY-MM-DD')
  const id = `seg-new-${Date.now()}`
  const segments = renumberSegments([
    ...state.segments,
    {
      id,
      dayIndex: 0,
      date: nextDate,
      overview: '待补充行程',
    },
  ])
  return {
    ...state,
    segments,
    focus: 'segment',
    selectedSegmentId: id,
  }
}

function removeSegmentDay(
  state: ProtoExecutionState,
  segmentId: string,
): ProtoExecutionState {
  const remaining = renumberSegments(
    state.segments.filter((segment) => segment.id !== segmentId),
  )
  const selectedSegmentId =
    state.selectedSegmentId === segmentId
      ? (remaining[0]?.id ?? null)
      : state.selectedSegmentId
  return {
    ...state,
    segments: remaining,
    segmentResources: state.segmentResources.filter(
      (item) => item.segmentId !== segmentId,
    ),
    focus: 'segment',
    selectedSegmentId,
  }
}

function countUngenerated(resources: ProtoResource[]): number {
  return resources.filter((item) => item.payableStatus === 'not_generated').length
}

function markGenerated(
  resources: ProtoResource[],
  predicate: (item: ProtoResource) => boolean,
): { next: ProtoResource[]; generated: number } {
  const now = '2026-07-30 11:00'
  let generated = 0
  const next = resources.map((item) => {
    if (!predicate(item) || item.payableStatus !== 'not_generated') {
      return item
    }
    generated += 1
    return { ...item, payableStatus: 'pending' as const, updatedAt: now }
  })
  return { next, generated }
}

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

  const departureUngenerated = countUngenerated(execution.departureResources)
  const segmentUngenerated = selected
    ? countUngenerated(selected.resources)
    : 0

  const confirmBatchGenerate = (scope: 'departure' | 'segment') => {
    const count =
      scope === 'departure' ? departureUngenerated : segmentUngenerated
    if (count <= 0) {
      message.info('没有尚未生成应付的资源')
      return
    }
    const scopeLabelText =
      scope === 'departure'
        ? '发团级资源'
        : `第${selected?.segment?.dayIndex ?? ''}天资源`
    Modal.confirm({
      title: '批量生成应付',
      content: `将为 ${scopeLabelText} 中 ${count} 项「未生成」资源生成应付单（与现网一致：对本范围未生成项批量处理）。`,
      okText: '生成',
      cancelText: '取消',
      onOk: () => {
        if (scope === 'departure') {
          const { next, generated } = markGenerated(
            execution.departureResources,
            () => true,
          )
          onExecutionChange({ ...execution, departureResources: next })
          message.success(`已批量生成 ${generated} 笔发团级应付`)
          return
        }
        if (!selectedId) return
        const { next, generated } = markGenerated(
          execution.segmentResources,
          (item) => item.segmentId === selectedId,
        )
        onExecutionChange({ ...execution, segmentResources: next })
        message.success(`已批量生成 ${generated} 笔按日应付`)
      },
    })
  }

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
                {departureUngenerated > 0 ? (
                  <Typography.Text type="secondary">
                    尚未生成应付 {departureUngenerated} 项
                  </Typography.Text>
                ) : null}
              </Space>
            ),
            extra: (
              <Space size={8} onClick={(event) => event.stopPropagation()}>
                {departureUngenerated > 0 ? (
                  <Button
                    size="small"
                    onClick={() => confirmBatchGenerate('departure')}
                  >
                    批量生成应付
                  </Button>
                ) : null}
                <Button
                  size="small"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => openDepartureDrawer()}
                >
                  添加
                </Button>
              </Space>
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

      <section className={styles.dayResourcePanel} aria-label="按日资源">
        <Flex align="center" justify="space-between" gap={12} wrap="wrap">
          <Typography.Text strong>按日资源</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            酒店 / 门票按天录入
          </Typography.Text>
        </Flex>

        <div className={styles.timeline}>
          {execution.segments.map((segment) => {
            const count = countResourcesForSegment(execution, segment.id)
            const active = selectedId === segment.id
            return (
              <div
                key={segment.id}
                className={`${styles.timelineChipWrap} ${
                  active ? styles.timelineChipWrapActive : ''
                }`}
              >
                <button
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
                <button
                  type="button"
                  className={styles.timelineChipRemove}
                  aria-label={`删除第${segment.dayIndex}天`}
                  title="删除这一天"
                  onClick={(event) => {
                    event.stopPropagation()
                    if (execution.segments.length <= 1) {
                      message.warning('至少保留一天')
                      return
                    }
                    const resourceCount = countResourcesForSegment(
                      execution,
                      segment.id,
                    )
                    Modal.confirm({
                      title: `删除第${segment.dayIndex}天？`,
                      content:
                        resourceCount > 0
                          ? `该日有 ${resourceCount} 项资源，删除后一并移除。`
                          : '删除后可再「添加一天」补回。后续天数会重新编号。',
                      okText: '删除',
                      okButtonProps: { danger: true },
                      cancelText: '取消',
                      onOk: () => {
                        onExecutionChange(removeSegmentDay(execution, segment.id))
                        message.success(`已删除第${segment.dayIndex}天`)
                      },
                    })
                  }}
                >
                  <CloseOutlined />
                </button>
              </div>
            )
          })}

          <button
            type="button"
            className={styles.timelineAddChip}
            onClick={() => {
              const next = addSegmentDay(execution)
              onExecutionChange(next)
              message.success(
                `已添加第${next.segments[next.segments.length - 1]?.dayIndex}天`,
              )
            }}
          >
            <PlusOutlined />
            <span>添加一天</span>
          </button>
        </div>

        {selected?.segment ? (
          <div className={styles.dayDetail}>
            <Flex align="center" justify="space-between" gap={12} wrap="wrap">
              <div>
                <Typography.Text strong>
                  第{selected.segment.dayIndex}天
                </Typography.Text>
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                  {selected.segment.date} · {selected.segment.overview}
                </Typography.Text>
              </div>
              <Flex align="center" gap={12} wrap="wrap">
                <ResourceAmountSummary resources={selected.resources} />
                {segmentUngenerated > 0 ? (
                  <Button onClick={() => confirmBatchGenerate('segment')}>
                    批量生成应付
                  </Button>
                ) : null}
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => openSegmentDrawer()}
                >
                  添加资源
                </Button>
              </Flex>
            </Flex>
            <div className={styles.dayDetailTable}>
              <ResourceTable
                resources={selected.resources}
                emptyText="本段暂无酒店/门票等资源"
                onEdit={(resource) => openSegmentDrawer(resource)}
              />
            </div>
          </div>
        ) : (
          <Empty
            description="暂无行程天，可点「添加一天」手工补段"
            style={{ padding: '24px 0' }}
          >
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => onExecutionChange(addSegmentDay(execution))}
            >
              添加一天
            </Button>
          </Empty>
        )}
      </section>

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
