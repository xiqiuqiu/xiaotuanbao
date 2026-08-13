import { Button, DatePicker, Input, InputNumber, Typography, theme } from 'antd'
import { useState } from 'react'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import type { AiReviewCandidateView, AiReviewableBasicInfoField } from '@xiaotuanbao/shared'
import { formatSavedValue, REVIEW_FIELD_LABELS } from './review-field-labels'
import styles from './PendingCandidateOverlay.module.css'

export interface PendingCandidateOverlayProps {
  fieldKey: AiReviewableBasicInfoField
  candidate: AiReviewCandidateView
  savedDisplay: string
  onCorrect: (value: string | number | null) => void
}

function evidenceText(candidate: AiReviewCandidateView): string {
  return candidate.evidence
    .map((item) => (item.kind === 'user_message' ? item.excerpt : item.rule))
    .join('；')
}

export function PendingCandidateOverlay({
  fieldKey,
  candidate,
  savedDisplay,
  onCorrect,
}: PendingCandidateOverlayProps) {
  const { token } = theme.useToken()
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const value = candidate.userCorrectedValue ?? candidate.proposedValue

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
          value={typeof value === 'number' ? value : Number(value)}
          onChange={(next) => onCorrect(next)}
        />
      ) : fieldKey === 'startDate' || fieldKey === 'endDate' ? (
        <DatePicker
          aria-label={`${REVIEW_FIELD_LABELS[fieldKey]}候选`}
          className={styles.fullWidth}
          value={typeof value === 'string' && value ? dayjs(value) : null}
          onChange={(next: Dayjs | null) => onCorrect(next?.format('YYYY-MM-DD') ?? null)}
        />
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
        <Typography.Paragraph type="secondary" className={styles.evidence}>
          {evidenceText(candidate)}
        </Typography.Paragraph>
      ) : null}
    </div>
  )
}
