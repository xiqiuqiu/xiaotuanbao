import { Button, DatePicker, Input, InputNumber, Typography, theme } from 'antd'
import { useState } from 'react'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import type {
  AiCandidateEvidence,
  AiReviewCandidateView,
  AiReviewableBasicInfoField,
} from '@xiaotuanbao/shared'
import { formatSavedValue, REVIEW_FIELD_LABELS } from './review-field-labels'
import styles from './PendingCandidateOverlay.module.css'

export interface PendingCandidateOverlayProps {
  fieldKey: AiReviewableBasicInfoField
  candidate: AiReviewCandidateView
  savedDisplay: string
  displayValue?: string
  onCorrect: (value: string | number | null) => void
  onPreviewMaterial?: (materialId: string) => void
}

function evidenceLabel(item: AiCandidateEvidence): string {
  if (item.kind === 'user_message') {
    return item.excerpt
  }
  if (item.kind === 'system_derivation') {
    return item.rule
  }
  return `「${item.excerpt}」第 ${item.pageNumber} 页`
}

export function PendingCandidateOverlay({
  fieldKey,
  candidate,
  savedDisplay,
  displayValue,
  onCorrect,
  onPreviewMaterial,
}: PendingCandidateOverlayProps) {
  const { token } = theme.useToken()
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const value =
    candidate.userCorrectedValue !== undefined
      ? candidate.userCorrectedValue
      : candidate.proposedValue

  return (
    <div
      className={styles.root}
      style={{
        borderColor: token.colorWarningBorder,
        background: token.colorWarningBg,
      }}
    >
      {fieldKey === 'expectedGuestCountHint' ? (
        <InputNumber
          aria-label={`${REVIEW_FIELD_LABELS[fieldKey]}候选`}
          min={0}
          max={9999}
          precision={0}
          style={{ width: '100%' }}
          value={value == null ? null : Number(value)}
          onChange={(next) => onCorrect(next)}
        />
      ) : fieldKey === 'startDate' || fieldKey === 'endDate' ? (
        <DatePicker
          aria-label={`${REVIEW_FIELD_LABELS[fieldKey]}候选`}
          className={styles.fullWidth}
          value={typeof value === 'string' && value ? dayjs(value) : null}
          onChange={(next: Dayjs | null) => onCorrect(next?.format('YYYY-MM-DD') ?? null)}
        />
      ) : fieldKey === 'templateId' ? (
        <Typography.Text aria-label={`${REVIEW_FIELD_LABELS[fieldKey]}候选`}>
          {displayValue ?? String(value ?? '')}
        </Typography.Text>
      ) : (
        <Input
          aria-label={`${REVIEW_FIELD_LABELS[fieldKey]}候选`}
          value={String(value ?? '')}
          onChange={(event) => onCorrect(event.target.value)}
        />
      )}
      <Typography.Text type="secondary" className={styles.saved}>
        已保存：{formatSavedValue(savedDisplay)}
      </Typography.Text>
      <Button
        type="link"
        size="small"
        className={styles.evidenceToggle}
        onClick={() => setEvidenceOpen((open) => !open)}
      >
        {evidenceOpen ? '收起证据' : '查看证据'}
      </Button>
      {evidenceOpen ? (
        <div className={styles.evidence}>
          {candidate.evidence.map((item) => (
            <Typography.Paragraph
              key={
                item.kind === 'material_region'
                  ? `${item.materialId}:${item.pageNumber}:${item.excerpt}`
                  : item.kind === 'user_message'
                    ? `user:${item.messageId ?? item.excerpt}`
                    : `rule:${item.rule}`
              }
              type="secondary"
              className={styles.evidenceItem}
            >
              {evidenceLabel(item)}
              {item.kind === 'material_region' && onPreviewMaterial ? (
                <Button
                  type="link"
                  size="small"
                  className={styles.evidenceToggle}
                  onClick={() => onPreviewMaterial(item.materialId)}
                >
                  预览档案
                </Button>
              ) : null}
            </Typography.Paragraph>
          ))}
        </div>
      ) : null}
    </div>
  )
}
