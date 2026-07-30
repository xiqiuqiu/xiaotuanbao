/**
 * PROTOTYPE Variant A — 顶栏页签 + 「全程」伪日段
 *
 * 导航：经典横向 Tabs（贴在发团头下方），业务/财务同级一排扫过去。
 * 执行：左侧日轨第一项是「全程资源」；选中某天时只看该天酒店/门票，不再叠发团级块。
 */
import { Button, Card, Col, Row, Tabs, Typography } from 'antd'
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
import type { ProtoExecutionState, ProtoTabKey } from './types'
import { GROUP_LABELS, PROTO_TABS } from './types'
import styles from './detail-layout-prototype.module.css'

export const VARIANT_A_META = {
  key: 'A',
  label: '顶栏页签 · 全程伪日段',
} as const

type VariantAProps = {
  activeTab: ProtoTabKey
  onTabChange: (tab: ProtoTabKey) => void
  execution: ProtoExecutionState
  onExecutionChange: (next: ProtoExecutionState) => void
  onAddDepartureResource: () => void
  onAddSegmentResource: (segmentId?: string) => void
}

export function VariantA({
  activeTab,
  onTabChange,
  execution,
  onExecutionChange,
  onAddDepartureResource,
  onAddSegmentResource,
}: VariantAProps) {
  return (
    <div className={styles.variantRoot}>
      <Tabs
        activeKey={activeTab}
        onChange={(key) => onTabChange(key as ProtoTabKey)}
        items={PROTO_TABS.map((tab) => ({
          key: tab.key,
          label: (
            <span>
              <Typography.Text type="secondary" style={{ fontSize: 11, marginRight: 4 }}>
                {GROUP_LABELS[tab.group] === '业务执行' ? '业' : '财'}
              </Typography.Text>
              {tab.label}
            </span>
          ),
        }))}
      />

      <div className={styles.variantBody}>
        {activeTab === 'execution' ? (
          <ExecutionA
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

function ExecutionA({
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
  const selectDeparture = () =>
    onExecutionChange({ ...execution, focus: 'departure', selectedSegmentId: null })

  const selectSegment = (segmentId: string) =>
    onExecutionChange({
      ...execution,
      focus: 'segment',
      selectedSegmentId: segmentId,
    })

  const selected =
    execution.focus === 'segment' && execution.selectedSegmentId
      ? segmentMeta(execution, execution.selectedSegmentId)
      : null

  return (
    <Row gutter={16} wrap={false} className={styles.executionRow}>
      <Col flex="200px" className={styles.dayRailCol}>
        <Card size="small" title="行程与范围" className={styles.fillCard}>
          <button
            type="button"
            className={`${styles.dayItem} ${
              execution.focus === 'departure' ? styles.dayItemSelected : ''
            }`}
            onClick={selectDeparture}
          >
            <div className={styles.dayItemTitle}>全程资源</div>
            <div className={styles.dayItemMeta}>
              发团级 · {execution.departureResources.length} 项
            </div>
            <div className={styles.dayItemHint}>用车 / 保险 / 导游</div>
          </button>

          <div className={styles.dayList}>
            {execution.segments.map((segment) => {
              const count = countResourcesForSegment(execution, segment.id)
              const selectedDay =
                execution.focus === 'segment' &&
                execution.selectedSegmentId === segment.id
              return (
                <button
                  key={segment.id}
                  type="button"
                  className={`${styles.dayItem} ${
                    selectedDay ? styles.dayItemSelected : ''
                  }`}
                  onClick={() => selectSegment(segment.id)}
                >
                  <div className={styles.dayItemTitle}>
                    第{segment.dayIndex}天
                    <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
                      {' '}
                      {segment.date.slice(5)}
                    </Typography.Text>
                  </div>
                  <div className={styles.dayItemMeta}>资源 {count} 项</div>
                  <div className={styles.dayItemHint}>{segment.overview}</div>
                </button>
              )
            })}
          </div>
        </Card>
      </Col>

      <Col flex="auto" style={{ minWidth: 0 }}>
        <Card size="small" className={styles.fillCard}>
          {execution.focus === 'departure' ? (
            <>
              <SectionTitle
                title="发团级资源"
                hint="统一录入一次，覆盖整团；不跟某一日绑定"
                extra={
                  <Typography.Text type="secondary">
                    合计{' '}
                    {formatYuan(
                      execution.departureResources.reduce(
                        (sum, item) => sum + item.amountCents,
                        0,
                      ),
                    )}
                  </Typography.Text>
                }
              />
              <ResourceTable
                resources={execution.departureResources}
                emptyText="暂无发团级资源"
                onAdd={onAddDepartureResource}
              />
            </>
          ) : selected?.segment ? (
            <>
              <SectionTitle
                title={`第${selected.segment.dayIndex}天 · 资源安排`}
                hint={`${selected.segment.date} · ${selected.segment.overview} · 酒店/门票等按天录入`}
                extra={
                  <Button
                    type="link"
                    size="small"
                    onClick={selectDeparture}
                  >
                    查看全程资源
                  </Button>
                }
              />
              <ResourceTable
                resources={selected.resources}
                emptyText="本段暂无资源"
                onAdd={onAddSegmentResource}
              />
            </>
          ) : (
            <Typography.Text type="secondary">请选择行程段</Typography.Text>
          )}
        </Card>
      </Col>
    </Row>
  )
}
