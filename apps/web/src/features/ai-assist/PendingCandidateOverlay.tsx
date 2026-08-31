import { Button, DatePicker, Input, InputNumber, Select, Typography, theme } from 'antd'
import { useState } from 'react'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import type { AiReviewCandidateView, AiReviewableBasicInfoField } from '@xiaotuanbao/shared'
import { resolveReviewField } from '@xiaotuanbao/ai-contracts'
import styles from './PendingCandidateOverlay.module.css'

export interface PendingCandidateOverlayProps {
  fieldKey: AiReviewableBasicInfoField
  candidate: AiReviewCandidateView
  savedDisplay: string
  displayValue?: string
  payloadSchema: string
  confirmationUnit: string
  onCorrect: (value: string | number | null) => void
}

export function PendingCandidateOverlay({
  fieldKey,
  candidate,
  savedDisplay,
  displayValue,
  payloadSchema,
  confirmationUnit,
  onCorrect,
}: PendingCandidateOverlayProps) {
  const { token } = theme.useToken()
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const value =
    candidate.userCorrectedValue !== undefined
      ? candidate.userCorrectedValue
      : candidate.proposedValue
  const field = resolveReviewField(payloadSchema, confirmationUnit, fieldKey)
  if (!field) return null
  const correct = (next: string | number | null) => {
    if (next === null || field.valueSchema.safeParse(next).success) onCorrect(next)
  }

  return (
    <div
      className={styles.root}
      style={{
        borderColor: token.colorWarningBorder,
        background: token.colorWarningBg,
      }}
    >
      {field.control === 'integer' ? (
        <InputNumber
          aria-label={`${field.label}候选`}
          min={field.number?.min}
          max={field.number?.max}
          precision={field.number?.precision}
          style={{ width: '100%' }}
          value={value == null ? null : Number(value)}
          onChange={(next) => correct(next)}
        />
      ) : field.control === 'choice' ? (
        <Select
          aria-label={`${field.label}候选`}
          className={styles.fullWidth}
          value={typeof value === 'string' ? value : undefined}
          options={field.options ? [...field.options] : []}
          onChange={(next) => correct(next)}
        />
      ) : field.control === 'date' ? (
        <DatePicker
          aria-label={`${field.label}候选`}
          className={styles.fullWidth}
          value={typeof value === 'string' && value ? dayjs(value) : null}
          onChange={(next: Dayjs | null) => correct(next?.format('YYYY-MM-DD') ?? null)}
        />
      ) : field.control === 'reference' || !field.editable ? (
        <Typography.Text aria-label={`${field.label}候选`}>
          {displayValue ?? String(value ?? '')}
        </Typography.Text>
      ) : (
        <Input
          aria-label={`${field.label}候选`}
          value={String(value ?? '')}
          onChange={(event) => correct(event.target.value)}
        />
      )}
      {candidate.clarity === 'needs_confirmation' ? (
        <Typography.Text type="warning">需确认</Typography.Text>
      ) : null}
      <Typography.Text type="secondary" className={styles.saved}>
        已保存：{field.format(savedDisplay)}
      </Typography.Text>
      <Button
        type="link"
        size="small"
        className={styles.evidenceToggle}
        onClick={() => setEvidenceOpen((open) => !open)}
      >
        {evidenceOpen ? '收起证据' : field.evidence.label}
      </Button>
      {evidenceOpen ? (
        <Typography.Paragraph type="secondary" className={styles.evidence}>
          {field.evidence.format(candidate.evidence)}
        </Typography.Paragraph>
      ) : null}
    </div>
  )
}
