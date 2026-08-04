import { Button, Tag, theme } from 'antd'
import { CloseOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import type { CSSProperties } from 'react'
import type { ExecutionLayer, MockDaySegment } from './shared'
import { MOCK_DAYS } from './shared'
import productionStyles from '../../components/ExecutionTab.module.css'
import styles from './execution-layer-switch-prototype.module.css'

export function MockExecutionTabStrip() {
  const tabs = [
    '概览信息',
    '客源管理',
    '执行安排',
    '增收记录',
    '应收管理',
    '应付管理',
    '收支流水',
    '核销记录',
  ]
  return (
    <div className={styles.mockTabStrip} role="tablist" aria-label="发团详情 Tab">
      {tabs.map((label) => (
        <span
          key={label}
          role="tab"
          aria-selected={label === '执行安排'}
          className={`${styles.mockTab}${label === '执行安排' ? ` ${styles.mockTabActive}` : ''}`}
        >
          {label}
        </span>
      ))}
    </div>
  )
}

function MockDayChip({ segment }: { segment: MockDaySegment }) {
  const { token } = theme.useToken()
  const selected = Boolean(segment.selected)
  const resourceLabel = segment.resourceCount > 0 ? `${segment.resourceCount}项` : '空'

  const axisTokenStyle = {
    '--execution-border': token.colorBorderSecondary,
    '--execution-border-subtle': token.colorSplit,
    '--execution-item-bg': token.colorBgContainer,
    '--execution-item-border': token.colorBorderSecondary,
    '--execution-primary': token.colorPrimary,
    '--execution-primary-bg': token.colorPrimaryBg,
    '--execution-primary-border': token.colorPrimaryBorder,
    '--execution-text': token.colorText,
    '--execution-text-secondary': token.colorTextSecondary,
    '--execution-text-tertiary': token.colorTextTertiary,
    '--execution-radius': `${token.borderRadiusLG}px`,
    '--execution-font-strong': String(token.fontWeightStrong),
    '--execution-error': token.colorError,
  } as CSSProperties

  return (
    <div
      style={axisTokenStyle}
      className={`${productionStyles.dayChipWrap}${selected ? ` ${productionStyles.dayChipWrapSelected}` : ''}`}
    >
      {segment.dayIndex > 1 ? (
        <Button
          type="text"
          size="small"
          className={productionStyles.dayChipDelete}
          icon={<CloseOutlined />}
          aria-label={`删除第${segment.dayIndex}天`}
          tabIndex={-1}
        />
      ) : null}
      <button type="button" className={productionStyles.dayChip} aria-pressed={selected}>
        <div className={productionStyles.dayChipDayRow}>
          <span className={productionStyles.dayChipDay}>D{segment.dayIndex}</span>
          {segment.pendingCheck ? (
            <Tag color="warning" className={productionStyles.dayChipCheckTag}>
              待检查
            </Tag>
          ) : null}
        </div>
        <span className={productionStyles.dayChipDate}>{segment.dateLabel}</span>
        <span className={productionStyles.dayChipName}>{segment.name}</span>
        <div className={productionStyles.dayChipFooter}>
          <span className={productionStyles.dayChipCount}>{resourceLabel}</span>
          <span className={productionStyles.dayChipPayableGap}>
            <span className={productionStyles.dayChipPayableRing} aria-hidden />
            <span>{segment.payableLabel}</span>
          </span>
        </div>
      </button>
      <div className={productionStyles.dayChipActions}>
        <Button type="text" size="small" icon={<EditOutlined />} aria-label="编辑" tabIndex={-1} />
      </div>
    </div>
  )
}

export function MockDayAxisStrip() {
  const { token } = theme.useToken()
  const axisTokenStyle = {
    '--execution-border': token.colorBorderSecondary,
    '--execution-item-border': token.colorBorderSecondary,
    '--execution-radius': `${token.borderRadiusLG}px`,
  } as CSSProperties

  return (
    <div
      className={productionStyles.dayResourcePanel}
      style={axisTokenStyle}
      aria-label="按日资源"
    >
      <div className={productionStyles.dayAxis}>
        {MOCK_DAYS.map((segment) => (
          <MockDayChip key={segment.id} segment={segment} />
        ))}
        <Button type="dashed" className={productionStyles.dayAxisAddChip}>
          <span className={productionStyles.dayAxisAddContent}>
            <PlusOutlined aria-hidden />
            <span>添加一天</span>
          </span>
        </Button>
      </div>
    </div>
  )
}

export function LayerStateHint({ layer }: { layer: ExecutionLayer }) {
  return (
    <p className={styles.stateHint} aria-live="polite">
      当前层级：
      <strong>{layer === 'day' ? '按日资源' : '发团级资源'}</strong>
      {layer === 'departure' ? '（下方将展示发团级资源表格，原型省略）' : '（下方为日程轴预览）'}
    </p>
  )
}
