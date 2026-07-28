import { useEffect, useRef, type CSSProperties } from 'react'
import { Button, Card, Col, Tag, Tooltip, Typography, theme } from 'antd'
import { EditOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { ItinerarySegmentSummary } from '@/types/api'
import { formatResourceOverview } from '../utils/segment-form'
import { segmentPayableGenerationGap } from '../utils/segment-payable-generation-gap'
import styles from './ExecutionTab.module.css'

type ExecutionSegmentListPaneProps = {
  segments: ItinerarySegmentSummary[]
  selectedSegmentId?: string
  mutationLocked: boolean
  generatingDaily?: boolean
  onSelect: (segmentId: string) => void
  onEdit: (segment: ItinerarySegmentSummary) => void
  onCreate: () => void
  onGenerateDaily: () => void
  onRebuildEmpty: () => void
}

export function ExecutionSegmentListPane({
  segments,
  selectedSegmentId,
  mutationLocked,
  generatingDaily = false,
  onSelect,
  onEdit,
  onCreate,
  onGenerateDaily,
  onRebuildEmpty,
}: ExecutionSegmentListPaneProps) {
  const { token } = theme.useToken()
  const segmentListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selectedSegmentId || !segmentListRef.current) {
      return
    }
    const selectedNode = segmentListRef.current.querySelector(
      `[data-segment-id="${selectedSegmentId}"]`,
    )
    if (
      selectedNode instanceof HTMLElement &&
      typeof selectedNode.scrollIntoView === 'function'
    ) {
      selectedNode.scrollIntoView({ block: 'nearest', behavior: 'auto' })
    }
  }, [selectedSegmentId, segments.length])

  const segmentTokenStyle = {
    '--execution-border': token.colorBorderSecondary,
    '--execution-fill-hover': token.colorFillTertiary,
    '--execution-primary-bg': token.colorPrimaryBg,
    '--execution-primary-border': token.colorPrimaryBorder,
    '--execution-item-bg': token.colorBgContainer,
    '--execution-item-border': token.colorBorderSecondary,
    '--execution-radius': `${token.borderRadiusLG}px`,
    '--execution-font-sm': `${token.fontSizeSM}px`,
    '--execution-font-strong': String(token.fontWeightStrong),
    '--execution-text': token.colorText,
    '--execution-text-secondary': token.colorTextSecondary,
    '--execution-text-tertiary': token.colorTextTertiary,
  } as CSSProperties

  return (
    <Col
      className={`${styles.paneCol} ${styles.segmentPaneCol}`}
      flex="280px"
      style={{ maxWidth: 280 }}
    >
      <Card
        className={styles.paneCard}
        classNames={{ body: styles.paneCardBody }}
        title="行程段"
        styles={{ body: { padding: 12 } }}
      >
        <div className={styles.segmentPane} style={segmentTokenStyle}>
          <div ref={segmentListRef} className={styles.segmentList}>
            {segments.length === 0 ? (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                暂无行程段
              </Typography.Paragraph>
            ) : (
              segments.map((segment) => (
                <SegmentNavItem
                  key={segment.id}
                  segment={segment}
                  selected={segment.id === selectedSegmentId}
                  showEdit={!mutationLocked}
                  onSelect={() => onSelect(segment.id)}
                  onEdit={() => onEdit(segment)}
                />
              ))
            )}
            {!mutationLocked ? (
              <>
                <div className={styles.segmentListGrow} aria-hidden />
                <div className={styles.segmentListFooter}>
                  <div className={styles.segmentListFooterActions}>
                    <Button
                      block
                      loading={generatingDaily}
                      aria-label="一键生成一日段"
                      onClick={onGenerateDaily}
                    >
                      一键生成一日段
                    </Button>
                    <Button
                      block
                      disabled={generatingDaily || segments.length === 0}
                      aria-label="重建空段"
                      onClick={onRebuildEmpty}
                    >
                      重建空段
                    </Button>
                    <Button block icon={<PlusOutlined />} aria-label="添加" onClick={onCreate}>
                      添加
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </Card>
    </Col>
  )
}

function formatNavDateRange(startDate: string | null, endDate: string | null): string | null {
  if (!startDate || !endDate) {
    return null
  }

  const start = dayjs(startDate).format('MM-DD')
  const end = dayjs(endDate).format('MM-DD')
  return `${start}–${end}`
}

function SegmentNavItem({
  segment,
  selected,
  showEdit,
  onSelect,
  onEdit,
}: {
  segment: ItinerarySegmentSummary
  selected: boolean
  showEdit: boolean
  onSelect: () => void
  onEdit: () => void
}) {
  const { token } = theme.useToken()
  const meta = formatNavDateRange(segment.startDate, segment.endDate)
  const gap = segmentPayableGenerationGap(
    segment.payableGeneratedCount,
    segment.resourceCount,
  )

  return (
    <div
      data-segment-id={segment.id}
      className={`${styles.segmentItem}${selected ? ` ${styles.segmentItemSelected}` : ''}`}
    >
      <button
        type="button"
        className={styles.segmentItemSelect}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <div className={styles.segmentItemHeader}>
          <div className={styles.segmentItemTitle}>
            <span>{segment.name}</span>
            {segment.pendingCheck ? <Tag color="warning">待检查</Tag> : null}
          </div>
        </div>
        {meta ? <span className={styles.segmentItemMeta}>{meta}</span> : null}
        <div className={styles.segmentItemOverviewRow}>
          <span className={styles.segmentItemOverview}>{formatResourceOverview(segment)}</span>
          {gap.hasGap ? (
            <Tooltip title={`本段还有 ${gap.ungenerated} 项资源未生成应付`}>
              <span
                className={styles.segmentPayableGap}
                aria-label={`生成 ${gap.generated}/${gap.total}`}
              >
                <span
                  className={styles.segmentPayableRing}
                  style={
                    {
                      '--ring-progress': `${gap.percent}%`,
                      '--ring-color': token.colorPrimary,
                      '--ring-track': token.colorFillSecondary,
                    } as CSSProperties
                  }
                  aria-hidden
                />
                <span aria-hidden>
                  生成 {gap.generated}/{gap.total}
                </span>
              </span>
            </Tooltip>
          ) : null}
        </div>
      </button>
      {showEdit ? (
        <Button
          type="text"
          size="small"
          className={styles.segmentItemEdit}
          icon={<EditOutlined />}
          aria-label={`编辑${segment.name}`}
          onClick={onEdit}
        />
      ) : null}
    </div>
  )
}
