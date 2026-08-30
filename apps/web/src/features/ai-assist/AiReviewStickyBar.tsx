import { Alert, Button, Space, Typography, theme } from 'antd'
import {
  registeredReviewSchemas,
  type ReviewConfirmationUnitDescriptor,
} from '@xiaotuanbao/ai-contracts'
import type { AiReviewCandidateView, AiReviewPackageView } from '@xiaotuanbao/shared'
import { formatReviewFieldList } from './review-field-labels'
import styles from './AiReviewStickyBar.module.css'

export interface AiReviewStickyBarProps {
  pendingReview: AiReviewPackageView
  confirming?: boolean
  rejecting?: boolean
  onConfirm: () => void
  onReject: () => void
}

function reviewRiskLabels(
  unit: ReviewConfirmationUnitDescriptor | undefined,
  candidates: AiReviewCandidateView[],
): string {
  const labels = new Set<string>()
  for (const field of unit?.fields ?? []) {
    if (candidates.some((candidate) => candidate.fieldKey === field.key)) {
      labels.add(field.risk.label)
    }
  }
  return Array.from(labels).join('、')
}

export function AiReviewStickyBar({
  pendingReview,
  confirming,
  rejecting,
  onConfirm,
  onReject,
}: AiReviewStickyBarProps) {
  const { token } = theme.useToken()
  const registered = registeredReviewSchemas.findByPayloadSchema(pendingReview.payloadSchema)
  const unit = registered?.confirmationUnits.find(
    (candidate) => candidate.key === pendingReview.confirmationUnit,
  )
  const schemaSupported = pendingReview.schemaSupported !== false && Boolean(unit)
  const fieldList = formatReviewFieldList(
    pendingReview.candidates.map((candidate) => candidate.fieldKey),
    pendingReview.payloadSchema,
    pendingReview.confirmationUnit,
  )
  const riskLabels = reviewRiskLabels(unit, pendingReview.candidates)

  return (
    <div
      className={styles.bar}
      role="region"
      aria-label="AI 阶段审核包"
      tabIndex={-1}
      style={{
        background: token.colorBgContainer,
        borderBottomColor: token.colorBorderSecondary,
      }}
    >
      <div className={styles.copy}>
        <Typography.Text strong>待确认 AI 建议</Typography.Text>
        {schemaSupported ? (
          <>
            <Typography.Text type="secondary">
              已建议修改{fieldList}。确认后写入{unit?.targetLabel}，拒绝后保留当前已保存值。
            </Typography.Text>
            <Typography.Text type="secondary">风险：{riskLabels}</Typography.Text>
          </>
        ) : (
          <Alert type="error" showIcon title="审核包版本不受支持，请重新生成建议" />
        )}
      </div>
      <Space>
        <Button onClick={onReject} loading={rejecting} disabled={confirming || !schemaSupported}>
          拒绝建议
        </Button>
        <Button type="primary" onClick={onConfirm} loading={confirming} disabled={rejecting || !schemaSupported}>
          确认写入草稿
        </Button>
      </Space>
    </div>
  )
}
