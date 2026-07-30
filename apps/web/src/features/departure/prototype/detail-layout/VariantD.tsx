/**
 * PROTOTYPE Variant D — 混搭：A 的顶栏页签 + B 的执行安排
 *
 * 用户选定方向：导航用顶栏 Tabs；执行区用发团级折叠条 + 横向日程轴。
 */
import { Tabs, Typography } from 'antd'
import { PlaceholderPane } from './shared'
import { ExecutionB } from './VariantB'
import type { ProtoExecutionState, ProtoTabKey } from './types'
import { GROUP_LABELS, PROTO_TABS } from './types'
import styles from './detail-layout-prototype.module.css'

export const VARIANT_D_META = {
  key: 'D',
  label: '顶栏Tabs · 横向日程轴',
} as const

type VariantDProps = {
  activeTab: ProtoTabKey
  onTabChange: (tab: ProtoTabKey) => void
  execution: ProtoExecutionState
  onExecutionChange: (next: ProtoExecutionState) => void
  onAddDepartureResource: () => void
  onAddSegmentResource: (segmentId?: string) => void
}

export function VariantD({
  activeTab,
  onTabChange,
  execution,
  onExecutionChange,
  onAddDepartureResource,
  onAddSegmentResource,
}: VariantDProps) {
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
