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
} from '@/services/ai-create-task.service'
import { awaitReviewConfirmationItem } from './await-review-confirmation-item'
import { ApiError } from '@/lib/request/client'

export function DepartureSourceOrderReview({
  departureId,
  canEdit,
  packageId,
  onLeaveWorkspace,
}: {
  departureId: string
  canEdit: boolean
  packageId?: string
  onLeaveWorkspace?: () => void
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
      item.status === 'pending' &&
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
      await queryClient.invalidateQueries({
        queryKey: ['departure-collaboration', departureId, conversationId],
      })
      void queryClient.invalidateQueries({ queryKey: ['departure', departureId] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '确认失败')
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
          onViewSourceOrder={(sourceOrderId) => {
            onLeaveWorkspace?.()
            void navigate({
              to: '/departure/$departureId',
              params: { departureId },
              search: { tab: 'sourceOrders', highlightSourceOrderId: sourceOrderId },
            })
          }}
          onContinueReceivables={(sourceOrderId) => {
            onLeaveWorkspace?.()
            void navigate({
              to: '/departure/$departureId',
              params: { departureId },
              search: { tab: 'receivables', sourceId: sourceOrderId },
            })
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
          saveGroup.error || confirm.error
            ? ((saveGroup.error ?? confirm.error)?.message ?? '操作失败，请重试')
            : undefined
        }
        saving={saveGroup.isPending}
        confirming={confirm.isPending}
        confirmationBlockedReason={pendingReview.confirmationBlockedReason ?? (
          pendingReview.conflicts?.length ? '请先核对新建议与人工修改的差异。' : undefined
        )}
        onSaveGroup={(corrections) => saveGroup.mutateAsync(corrections)}
        onConfirm={() => confirm.mutateAsync().then(() => undefined)}
      />
    </div>
  )
}
