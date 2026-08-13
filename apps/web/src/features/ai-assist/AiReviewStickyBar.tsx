import { Button, Space, Typography, theme } from 'antd'
import type { AiReviewPackageView } from '@xiaotuanbao/shared'
import { formatReviewFieldList } from './review-field-labels'
import styles from './AiReviewStickyBar.module.css'

export interface AiReviewStickyBarProps {
  pendingReview: AiReviewPackageView
  confirming?: boolean
  rejecting?: boolean
  onConfirm: () => void
  onReject: () => void
}

export function AiReviewStickyBar({
  pendingReview,
  confirming,
  rejecting,
  onConfirm,
  onReject,
}: AiReviewStickyBarProps) {
  const { token } = theme.useToken()
  const fieldList = formatReviewFieldList(pendingReview.candidates.map((candidate) => candidate.fieldKey))

  return (
    <div
      className={styles.bar}
      role="region"
      aria-label="AI 阶段审核包"
      style={{
        background: token.colorBgContainer,
        borderBottomColor: token.colorBorderSecondary,
      }}
    >
      <div className={styles.copy}>
        <Typography.Text strong>待确认 AI 建议</Typography.Text>
        <Typography.Text type="secondary">
          已建议修改{fieldList}。确认后写入发团创建草稿，拒绝后保留当前已保存值。
        </Typography.Text>
      </div>
      <Space>
        <Button onClick={onReject} loading={rejecting} disabled={confirming}>
          拒绝建议
        </Button>
        <Button type="primary" onClick={onConfirm} loading={confirming} disabled={rejecting}>
          确认写入草稿
        </Button>
      </Space>
    </div>
  )
}
