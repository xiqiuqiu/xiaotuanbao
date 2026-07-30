/**
 * PROTOTYPE Variant D — 混搭：A 的顶栏页签 + B 的执行安排
 *
 * 导航：顶栏 Tabs（业务 / 财务用细分隔，无「业」「财」前缀）。
 * 执行：发团级折叠条 + 横向日程轴。
 */
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
  const operations = PROTO_TABS.filter((tab) => tab.group === 'operations')
  const finance = PROTO_TABS.filter((tab) => tab.group === 'finance')

  return (
    <div className={styles.variantRoot}>
      <nav className={styles.topTabBar} aria-label="发团详情功能">
        <div className={styles.topTabCluster}>
          <span className={styles.topTabGroupLabel}>{GROUP_LABELS.operations}</span>
          <div className={styles.topTabList} role="tablist">
            {operations.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`${styles.topTab} ${
                  activeTab === tab.key ? styles.topTabActive : ''
                }`}
                onClick={() => onTabChange(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.topTabDivider} aria-hidden />

        <div className={styles.topTabCluster}>
          <span className={styles.topTabGroupLabel}>{GROUP_LABELS.finance}</span>
          <div className={styles.topTabList} role="tablist">
            {finance.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`${styles.topTab} ${
                  activeTab === tab.key ? styles.topTabActive : ''
                }`}
                onClick={() => onTabChange(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

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
