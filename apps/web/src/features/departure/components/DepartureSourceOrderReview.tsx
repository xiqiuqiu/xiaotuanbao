import { useRef } from 'react'
import { App } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA } from '@xiaotuanbao/ai-contracts'
import { SourceOrderReviewPanel } from '@/features/ai-assist/SourceOrderReviewPanel'
import { useAgentConversationStore } from '@/features/agent-conversation/agent-conversation.store'
import {
  acceptReviewConfirmation,
  getReviewConfirmation,
  listDepartureCollaboration,
  patchAiReviewPackage,
  rejectAiReviewPackage,
  cancelAiReviewPackage,
} from '@/services/ai-create-task.service'
import { prepareSourceOrderReceivableReview } from '@/services/agent-collaboration.service'
import { awaitReviewConfirmationItem } from './await-review-confirmation-item'
import { ApiError } from '@/lib/request/client'
import { useConfirmedReviewInvalidation } from '@/features/agent-conversation/review-confirmation-for-package'

export function DepartureSourceOrderReview({
  departureId,
  canEdit,
  packageId,
  onLeaveWorkspace,
  onPreparedReceivableReview,
}: {
  departureId: string
  canEdit: boolean
  packageId?: string
  onLeaveWorkspace?: () => void
  onPreparedReceivableReview?: (packageId: string) => void
}) {
  const { message } = App.useApp()
  const decisions = useRef<Record<string, string>>({})
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const conversationId = useAgentConversationStore((state) => state.conversationId)

  const collaborationQuery = useQuery({
    queryKey: ['departure-collaboration', departureId, conversationId],
    queryFn: () => listDepartureCollaboration(departureId, conversationId ?? undefined),
    enabled: Boolean(departureId),
  })

  const pendingReview = (collaborationQuery.data?.items ?? []).find(
    (item) =>
      (!packageId || item.id === packageId) &&
      (item.status === 'pending' || item.status === 'conflict') &&
      item.payloadSchema === SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA,
  )
  const succeeded = (collaborationQuery.data?.confirmations ?? [])
    .flatMap((confirmation) => confirmation.items)
    .find(
      (item) =>
        (!packageId || item.packageId === packageId) &&
        item.status === 'succeeded' &&
        item.resultRef?.objectKind === 'source_order',
    )

  const invalidateConfirmed = useConfirmedReviewInvalidation(
    departureId,
    pendingReview ?? (succeeded ? {
      id: succeeded.packageId,
      status: 'confirmed',
      payloadSchema: SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA,
    } : undefined),
    succeeded,
  )

  const dispose = useMutation({
    mutationFn: async (action: 'reject' | 'cancel') => {
      if (!pendingReview || !canEdit) throw new Error('当前不能处理审核建议')
      const apply = action === 'reject' ? rejectAiReviewPackage : cancelAiReviewPackage
      await apply(pendingReview.conversationId ?? '', pendingReview.id, {
        expectedPackageVersion: pendingReview.version,
      })
    },
    onSuccess: async (_result, action) => {
      await queryClient.invalidateQueries({ queryKey: ['departure-collaboration', departureId] })
      message.success(action === 'reject' ? '已拒绝建议，未创建客源单' : '已取消审核，未创建客源单')
    },
    onError: (error) => {
      const conflict = error instanceof ApiError && error.code === 409
      if (conflict) void queryClient.invalidateQueries({ queryKey: ['departure-collaboration', departureId] })
      message.error(conflict ? '审核包版本已变化，请核对最新内容后重试' : '操作失败，请重试')
    },
  })

  const saveGroup = useMutation({
    mutationFn: async (corrections: Record<string, unknown>) => {
      if (!pendingReview) return
      await patchAiReviewPackage(pendingReview.conversationId ?? '', pendingReview.id, {
        expectedPackageVersion: pendingReview.version,
        corrections,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['departure-collaboration', departureId, conversationId],
      })
    },
    onError: (error) => {
      const conflict = error instanceof ApiError && error.code === 409
      message.error(conflict ? '审核包版本已变化，请刷新后重试' : '保存失败')
    },
  })

  const confirm = useMutation({
    mutationFn: async () => {
      if (!pendingReview) return
      const key = `${pendingReview.id}:${pendingReview.version}`
      const decisionCommandId = (decisions.current[key] ??= crypto.randomUUID())
      const accepted = await acceptReviewConfirmation({
        decisionCommandId,
        items: [{ packageId: pendingReview.id, expectedPackageVersion: pendingReview.version }],
      })
      return awaitReviewConfirmationItem({
        decisionCommandId: accepted.decisionCommandId,
        packageId: pendingReview.id,
        getConfirmation: getReviewConfirmation,
      })
    },
    onSuccess: async () => {
      invalidateConfirmed('succeeded')
      await queryClient.invalidateQueries({
        queryKey: ['departure-collaboration', departureId, conversationId],
      })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '确认失败')
    },
  })

  const prepareReceivable = useMutation({
    mutationFn: async (sourceOrderId: string) => {
      if (!conversationId) throw new Error('会话不存在')
      return prepareSourceOrderReceivableReview(departureId, {
        sourceOrderId,
        conversationId,
      })
    },
    onSuccess: async (review) => {
      await queryClient.invalidateQueries({
        queryKey: ['departure-collaboration', departureId, conversationId],
      })
      onPreparedReceivableReview?.(review.id)
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '准备应收审核失败')
    },
  })

  if (!pendingReview && !succeeded) {
    return null
  }

  if (!pendingReview && succeeded?.resultRef?.objectId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <SourceOrderReviewPanel
          createdSourceOrderId={succeeded.resultRef.objectId}
          canContinueReceivables={Boolean(conversationId)}
          error={
            prepareReceivable.error
              ? (prepareReceivable.error.message ?? '准备应收审核失败')
              : undefined
          }
          continuingReceivables={prepareReceivable.isPending}
          onViewSourceOrder={(sourceOrderId) => {
            onLeaveWorkspace?.()
            void navigate({
              to: '/departure/$departureId',
              params: { departureId },
              search: { tab: 'sourceOrders', highlightSourceOrderId: sourceOrderId },
            })
          }}
          onSkipReceivables={() => {
            message.info('已暂不提交应收，可稍后从本结果继续。')
          }}
          onContinueReceivables={(sourceOrderId) => {
            prepareReceivable.mutate(sourceOrderId)
          }}
        />
      </div>
    )
  }

  if (!pendingReview) {
    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <SourceOrderReviewPanel
        pendingReview={pendingReview}
        readOnly={!canEdit}
        error={
          saveGroup.error || confirm.error || dispose.error
            ? ((saveGroup.error ?? confirm.error ?? dispose.error)?.message ?? '操作失败，请重试')
            : undefined
        }
        saving={saveGroup.isPending}
        confirming={confirm.isPending}
        disposing={dispose.isPending}
        confirmationBlockedReason={pendingReview.status === 'conflict'
          ? '审核内容存在版本冲突，可拒绝建议或取消审核后重新整理。'
          : pendingReview.confirmationBlockedReason ?? (
          pendingReview.conflicts?.length ? '请先核对新建议与人工修改的差异。' : undefined
        )}
        onSaveGroup={(corrections) => saveGroup.mutateAsync(corrections)}
        onConfirm={() => confirm.mutateAsync().then(() => undefined)}
        onReject={() => dispose.mutateAsync('reject')}
        onCancel={() => dispose.mutateAsync('cancel')}
      />
    </div>
  )
}
