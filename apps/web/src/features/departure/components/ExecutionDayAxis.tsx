import { useEffect, useRef, type CSSProperties } from 'react'
import { Button, Modal, Tag, Tooltip, Typography, theme } from 'antd'
import { CloseOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { ItinerarySegmentSummary } from '@/types/api'
import { segmentPayableGenerationGap } from '../utils/segment-payable-generation-gap'
import styles from './ExecutionTab.module.css'

type ExecutionDayAxisProps = {
  segments: ItinerarySegmentSummary[]
  selectedSegmentId?: string
  mutationLocked: boolean
  generatingDaily?: boolean
  onSelect: (segmentId: string) => void
  onEdit: (segment: ItinerarySegmentSummary) => void
  onCreate: () => void
  onDelete: (segment: ItinerarySegmentSummary) => void
  onGenerateDaily: () => void
  onRebuildEmpty: () => void
}

function formatDayAxisDate(startDate: string | null, endDate: string | null): string | null {
  if (!startDate || !endDate) {
    return null
  }

  const start = dayjs(startDate)
  const end = dayjs(endDate)
  if (start.isSame(end, 'day')) {
    return start.format('MM-DD')
  }

  return `${start.format('MM-DD')}–${end.format('MM-DD')}`
}

export function ExecutionDayAxis({
  segments,
  selectedSegmentId,
  mutationLocked,
  generatingDaily = false,
  onSelect,
  onEdit,
  onCreate,
  onDelete,
  onGenerateDaily,
  onRebuildEmpty,
}: ExecutionDayAxisProps) {
  const { token } = theme.useToken()
  const axisRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selectedSegmentId || !axisRef.current) {
      return
    }
    const selectedNode = axisRef.current.querySelector(
      `[data-segment-id="${selectedSegmentId}"]`,
    )
    if (
      selectedNode instanceof HTMLElement &&
      typeof selectedNode.scrollIntoView === 'function'
    ) {
      selectedNode.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'auto' })
    }
  }, [selectedSegmentId, segments.length])

  const axisTokenStyle = {
    '--execution-border': token.colorBorderSecondary,
    '--execution-fill-hover': token.colorFillTertiary,
    '--execution-primary-bg': token.colorPrimaryBg,
    '--execution-primary-border': token.colorPrimaryBorder,
    '--execution-primary': token.colorPrimary,
    '--execution-item-bg': token.colorBgContainer,
    '--execution-item-border': token.colorBorderSecondary,
    '--execution-radius': `${token.borderRadiusLG}px`,
    '--execution-font-sm': `${token.fontSizeSM}px`,
    '--execution-font-strong': String(token.fontWeightStrong),
    '--execution-text': token.colorText,
    '--execution-text-secondary': token.colorTextSecondary,
    '--execution-text-tertiary': token.colorTextTertiary,
    '--execution-error': token.colorError,
  } as CSSProperties

  const confirmDelete = (segment: ItinerarySegmentSummary, dayLabel: string) => {
    if (segment.resourceCount > 0) {
      Modal.confirm({
        title: `删除${dayLabel}？`,
        content: `该日有 ${segment.resourceCount} 项资源，请先清空资源后再删除。`,
        okText: '知道了',
        cancelText: '取消',
        onOk: () => undefined,
      })
      return
    }

    Modal.confirm({
      title: `删除${dayLabel}？`,
      content: '删除后可再「添加一天」补回。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => onDelete(segment),
    })
  }

  return (
    <section
      className={styles.dayResourcePanel}
      style={axisTokenStyle}
      aria-label="按日资源"
    >
      <div className={styles.dayAxisHeader}>
        <Typography.Text strong>按日资源</Typography.Text>
        {!mutationLocked ? (
          <div className={styles.dayAxisHeaderActions}>
            <Button
              size="small"
              loading={generatingDaily}
              aria-label="一键生成一日段"
              onClick={onGenerateDaily}
            >
              一键生成一日段
            </Button>
            <Button
              size="small"
              disabled={generatingDaily || segments.length === 0}
              aria-label="重建空段"
              onClick={onRebuildEmpty}
            >
              重建空段
            </Button>
          </div>
        ) : null}
      </div>

      <div ref={axisRef} className={styles.dayAxis}>
        {segments.map((segment, index) => {
          const dayIndex = index + 1
          const dayLabel = `第${dayIndex}天`
          const selected = segment.id === selectedSegmentId
          return (
            <DayChip
              key={segment.id}
              segment={segment}
              dayIndex={dayIndex}
              selected={selected}
              showEdit={!mutationLocked}
              showDelete={!mutationLocked}
              onSelect={() => onSelect(segment.id)}
              onEdit={() => onEdit(segment)}
              onDelete={() => {
                confirmDelete(segment, dayLabel)
              }}
            />
          )
        })}

        {!mutationLocked ? (
          <button
            type="button"
            className={styles.dayAxisAddChip}
            aria-label="添加一天"
            onClick={onCreate}
          >
            <PlusOutlined />
            <span>添加一天</span>
          </button>
        ) : null}
      </div>
    </section>
  )
}

function DayChip({
  segment,
  dayIndex,
  selected,
  showEdit,
  showDelete,
  onSelect,
  onEdit,
  onDelete,
}: {
  segment: ItinerarySegmentSummary
  dayIndex: number
  selected: boolean
  showEdit: boolean
  showDelete: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { token } = theme.useToken()
  const dateLabel = formatDayAxisDate(segment.startDate, segment.endDate)
  const gap = segmentPayableGenerationGap(
    segment.payableGeneratedCount,
    segment.resourceCount,
  )
  const resourceLabel =
    segment.resourceCount > 0 ? `${segment.resourceCount}项` : '空'

  return (
    <div
      data-segment-id={segment.id}
      className={`${styles.dayChipWrap}${selected ? ` ${styles.dayChipWrapSelected}` : ''}`}
    >
      <button
        type="button"
        className={`${styles.dayChip}${selected ? ` ${styles.dayChipSelected}` : ''}`}
        aria-pressed={selected}
        aria-label={`D${dayIndex} ${segment.name}`}
        onClick={onSelect}
      >
        <div className={styles.dayChipDayRow}>
          <span className={styles.dayChipDay}>D{dayIndex}</span>
          {segment.pendingCheck ? (
            <Tag color="warning" className={styles.dayChipCheckTag}>
              待检查
            </Tag>
          ) : null}
        </div>
        {dateLabel ? <span className={styles.dayChipDate}>{dateLabel}</span> : null}
        <span className={styles.dayChipName} title={segment.name}>
          {segment.name}
        </span>
        <div className={styles.dayChipFooter}>
          <span className={styles.dayChipCount}>{resourceLabel}</span>
          {gap.hasGap ? (
            <Tooltip title={`本段还有 ${gap.ungenerated} 项资源未生成应付`}>
              <span
                className={styles.dayChipPayableGap}
                aria-label={`生成 ${gap.generated}/${gap.total}`}
              >
                <span
                  className={styles.dayChipPayableRing}
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
                  {gap.generated}/{gap.total}
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
          className={styles.dayChipEdit}
          icon={<EditOutlined />}
          aria-label={`编辑${segment.name}`}
          onClick={onEdit}
        />
      ) : null}
      {showDelete ? (
        <button
          type="button"
          className={styles.dayChipRemove}
          aria-label={`删除第${dayIndex}天`}
          title="删除这一天"
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
        >
          <CloseOutlined />
        </button>
      ) : null}
    </div>
  )
}
