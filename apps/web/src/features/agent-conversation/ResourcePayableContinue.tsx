import { Alert, App, Button, Checkbox, Space, Typography } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { RESOURCE_PAYABLE_REVIEW_PAYLOAD_SCHEMA } from '@xiaotuanbao/ai-contracts'
import { prepareResourcePayableReviews } from '@/services/agent-collaboration.service'
import type { ReviewConfirmationView } from '@/types/api'
import styles from './SegmentResourceReviewPanel.module.css'

export type ResourcePayableContinueItem = {
  packageId: string
  sourceType: 'segment_resource' | 'departure_resource'
  sourceId: string
  title: string
}

export function ResourcePayableContinue({
  departureId,
  conversationId,
  items,
  onPrepared,
}: {
  departureId: string
  conversationId: string
  items: ResourcePayableContinueItem[]
  onPrepared?: (packageIds: string[]) => void
}) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string[]>([])
  const mutation = useMutation({
    mutationFn: () =>
      prepareResourcePayableReviews(departureId, {
        conversationId,
        items: items
          .filter((item) => selected.includes(item.packageId))
          .map((item) => ({ sourceType: item.sourceType, sourceId: item.sourceId })),
      }),
    onSuccess: async (reviews) => {
      await queryClient.invalidateQueries({
        queryKey: ['departure-collaboration', departureId],
      })
      onPrepared?.(reviews.map((review) => review.id))
      message.success(reviews.length > 1 ? '已准备所选资源的应付审核' : '已准备应付审核')
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '准备应付审核失败')
    },
  })

  if (items.length === 0) return null

  return (
    <section className={styles.item} aria-label="继续提交应付">
      <Alert
        type="success"
        showIcon
        title="资源已写入"
        description="创建时未自动提交应付。可从本次成功且尚未提交的资源中选择继续。"
      />
      <Checkbox.Group
        style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}
        value={selected}
        onChange={(value) => setSelected(value.map(String))}
        options={items.map((item) => ({
          label: item.title,
          value: item.packageId,
        }))}
      />
      <Space style={{ marginTop: 12 }} wrap>
        <Button
          onClick={() => {
            setSelected([])
            message.info('已暂不提交应付，可稍后从本结果继续。')
          }}
        >
          暂不处理
        </Button>
        <Button
          type="primary"
          disabled={selected.length === 0}
          loading={mutation.isPending}
          onClick={() => void mutation.mutateAsync().catch(() => undefined)}
        >
          继续提交应付
        </Button>
      </Space>
      {selected.length === 0 ? (
        <Typography.Text type="secondary" role="status">
          未选择资源时不会提交应付。
        </Typography.Text>
      ) : null}
    </section>
  )
}

function candidateValue(
  candidates: Array<{ fieldKey: string; proposedValue?: unknown; userCorrectedValue?: unknown }>,
  fieldKey: string,
): unknown {
  const candidate = candidates.find((item) => item.fieldKey === fieldKey)
  if (!candidate) return undefined
  return candidate.userCorrectedValue !== undefined
    ? candidate.userCorrectedValue
    : candidate.proposedValue
}

function submittedPayableKeys(
  packages: Array<{
    payloadSchema: string
    status?: string
    candidates: Array<{ fieldKey: string; proposedValue?: unknown; userCorrectedValue?: unknown }>
  }>,
): Set<string> {
  return new Set(
    packages.flatMap((pkg) => {
      // Only confirmed payables remove the resource from Continue.
      // pending stays visible as 审核中; cancel/reject brings the resource back.
      if (pkg.payloadSchema !== RESOURCE_PAYABLE_REVIEW_PAYLOAD_SCHEMA) return []
      if (pkg.status !== 'confirmed') return []
      const sourceType = candidateValue(pkg.candidates, 'sourceType')
      const sourceId = candidateValue(pkg.candidates, 'sourceId')
      if (
        (sourceType !== 'segment_resource' && sourceType !== 'departure_resource') ||
        typeof sourceId !== 'string' ||
        !sourceId
      ) {
        return []
      }
      return [`${sourceType}:${sourceId}`]
    }),
  )
}

export function succeededResourceItems(
  confirmations: ReviewConfirmationView[],
  packages: Array<{
    id: string
    payloadSchema: string
    status?: string
    candidates: Array<{ fieldKey: string; proposedValue?: unknown; userCorrectedValue?: unknown }>
  }>,
): ResourcePayableContinueItem[] {
  const submitted = submittedPayableKeys(packages)
  return packages.flatMap((pkg) => {
    const confirmation = confirmations
      .flatMap((entry) => entry.items)
      .filter((item) => item.packageId === pkg.id && item.status === 'succeeded')
      .at(-1)
    const objectId = confirmation?.resultRef?.objectId
    if (!objectId) return []
    const sourceType =
      confirmation.resultRef?.objectKind === 'departure_resource'
        ? 'departure_resource'
        : confirmation.resultRef?.objectKind === 'segment_resource'
          ? 'segment_resource'
          : null
    if (!sourceType) return []
    if (submitted.has(`${sourceType}:${objectId}`)) return []
    const titleValue = candidateValue(pkg.candidates, 'title')
    return [
      {
        packageId: pkg.id,
        sourceType,
        sourceId: objectId,
        title: typeof titleValue === 'string' && titleValue ? titleValue : '资源',
      },
    ]
  })
}
