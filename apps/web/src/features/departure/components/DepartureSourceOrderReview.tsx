import { message } from 'antd'
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
}: {
  departureId: string
  canEdit: boolean
}) {
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
      item.status === 'pending' && item.payloadSchema === SOURCE_ORDER_REVIEW_PAYLOAD_SCHEMA,
  )
  const succeeded = (collaborationQuery.data?.confirmations ?? [])
    .flatMap((confirmation) => confirmation.items)
    .find((item) => item.status === 'succeeded' && item.resultRef?.objectKind === 'source_order')

  const saveGroup = useMutation({
    mutationFn: async (corrections: Record<string, unknown>) => {
      if (!pendingReview) return
      await patchAiReviewPackage(pendingReview.conversationId ?? '', pendingReview.id, {
        expectedPackageVersion: pendingReview.version,
        corrections,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
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
      const accepted = await acceptReviewConfirmation({
        decisionCommandId: crypto.randomUUID(),
        items: [{ packageId: pendingReview.id, expectedPackageVersion: pendingReview.version }],
      })
      return awaitReviewConfirmationItem({
        decisionCommandId: accepted.decisionCommandId,
        packageId: pendingReview.id,
        getConfirmation: getReviewConfirmation,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['departure-collaboration', departureId, conversationId],
      })
      void queryClient.invalidateQueries({ queryKey: ['departure', departureId] })
    },
    onError: () => {
      message.error('确认失败')
    },
  })

  if (!canEdit || (!pendingReview && !succeeded)) {
    return null
  }

  if (!pendingReview && succeeded?.resultRef?.objectId) {
    return (
      <div style={{ marginBottom: 16 }}>
        <SourceOrderReviewPanel
          createdSourceOrderId={succeeded.resultRef.objectId}
          onViewSourceOrder={(sourceOrderId) => {
            void navigate({
              to: '/departure/$departureId',
              params: { departureId },
              search: { tab: 'sourceOrders', highlightSourceOrderId: sourceOrderId },
            })
          }}
          onContinueReceivables={(sourceOrderId) => {
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
    <div style={{ marginBottom: 16 }}>
      <SourceOrderReviewPanel
        pendingReview={pendingReview}
        saving={saveGroup.isPending}
        confirming={confirm.isPending}
        onSaveGroup={(corrections) => saveGroup.mutateAsync(corrections)}
        onConfirm={() => confirm.mutateAsync().then(() => undefined)}
      />
    </div>
  )
}
