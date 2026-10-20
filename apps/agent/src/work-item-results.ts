import {
  conversationRoutingOutputSchema,
  submitReviewPackageModelInputSchema,
  submitSegmentResourceReviewModelInputSchema,
  submitDepartureResourceReviewModelInputSchema,
  submitDepartureEditReviewModelInputSchema,
  submitInitialFinanceReviewModelInputSchema,
  submitSourceOrderReviewPackageModelInputSchema,
  type HeadlessResolvedItemsResult,
} from '@xiaotuanbao/ai-contracts'
import type { RecordedWorkItem } from './work-items.tool'

export const WORK_ITEMS_PROCESSOR_ID = 'work-items-completion'

export function toolPayload(value: unknown): {
  toolCallId?: string; toolName?: string; isError?: boolean; error?: unknown; result?: unknown
} {
  if (!value || typeof value !== 'object') return {}
  return (value as { payload?: object }).payload ?? value
}

const reviewSchemas = {
  proposeReviewPackage: submitReviewPackageModelInputSchema,
  proposeSegmentResourceReviewPackage: submitSegmentResourceReviewModelInputSchema,
  proposeDepartureResourceReviewPackage: submitDepartureResourceReviewModelInputSchema,
  proposeDepartureEditReviewPackage: submitDepartureEditReviewModelInputSchema,
  proposeInitialFinanceReviewPackage: submitInitialFinanceReviewModelInputSchema,
  proposeSourceOrderReviewPackage: submitSourceOrderReviewPackageModelInputSchema,
}

/** The live tool and final collector must assign the same indices to accepted results. */
export function workItemReferences(toolResults: readonly unknown[]) {
  const reviews: HeadlessResolvedItemsResult['reviewPackages'] = []
  const routing: ReturnType<typeof conversationRoutingOutputSchema.parse>[] = []
  const seen = new Set<string>()
  for (const raw of toolResults) {
    const { toolCallId, toolName, result, isError, error } = toolPayload(raw)
    if (toolCallId && seen.has(toolCallId)) continue
    if (toolCallId) seen.add(toolCallId)
    if (isError || error || !result || typeof result !== 'object' || !('status' in result) || result.status !== 'accepted') continue
    if (toolName === 'routeConversation') {
      const parsed = conversationRoutingOutputSchema.safeParse(result)
      if (parsed.success) routing.push(parsed.data)
    }
    const schema = reviewSchemas[toolName as keyof typeof reviewSchemas]
    if (!schema) continue
    const { status, payloadSchema, normalizedProposal, ...proposal } = result as Record<string, unknown>
    const parsed = schema.safeParse(proposal)
    if (parsed.success) reviews.push(parsed.data)
  }
  return { reviews, routing }
}

export type WorkItemIssue = { code: string; itemId?: string }

export function validateRecordedWorkItems(
  items: readonly RecordedWorkItem[],
  references: ReturnType<typeof workItemReferences>,
  currentUserText: string | undefined,
  allowPending: boolean,
): WorkItemIssue | null {
  if (!items.length) return { code: 'ITEMS_MISSING' }
  const usedRouting = new Set<number>()
  const usedReviews = new Set<number>()
  for (const item of items) {
    const invalid = (code: string) => ({ code, itemId: item.id })
    const resolution = item.resolution
    if (resolution.kind === 'pending') {
      if (!allowPending) return invalid('ITEM_UNRESOLVED')
    } else if (resolution.kind === 'answered') {
      if (item.goal !== 'answer') return invalid('ANSWER_CANNOT_REPLACE_ACTION')
    } else if (resolution.kind === 'withdrawn') {
      if (!currentUserText?.includes(resolution.userExcerpt)) return invalid('WITHDRAWAL_NOT_AUTHORIZED')
    } else if (resolution.kind === 'awaiting_review') {
      if (item.goal !== 'propose_change') return invalid('REVIEW_GOAL_MISMATCH')
      for (const index of resolution.reviewPackageIndexes) {
        if (!references.reviews[index]) return invalid('REVIEW_REFERENCE_MISSING')
        if (usedReviews.has(index)) return invalid('REVIEW_REFERENCE_REUSED')
        usedReviews.add(index)
      }
    } else {
      if (usedRouting.has(resolution.routingIndex)) return invalid('ROUTING_REFERENCE_REUSED')
      usedRouting.add(resolution.routingIndex)
      const actual = references.routing[resolution.routingIndex]
      if (!actual) return invalid('ROUTING_REFERENCE_MISSING')
      if (resolution.kind === 'awaiting_user_input' && !('interaction' in actual)) return invalid('CLARIFICATION_REFERENCE_MISMATCH')
      if (resolution.kind === 'registered_intent' && (item.goal !== 'governed_action' || !('registeredIntent' in actual))) return invalid('INTENT_REFERENCE_MISMATCH')
    }
  }
  if ((!allowPending || items.every(item => item.resolution.kind !== 'pending')) && references.reviews.length !== usedReviews.size) {
    return { code: 'REVIEW_NOT_ASSIGNED' }
  }
  return null
}

export function resolveRecordedWorkItems(
  items: readonly RecordedWorkItem[],
  references: ReturnType<typeof workItemReferences>,
): HeadlessResolvedItemsResult['items'] {
  return items.flatMap<HeadlessResolvedItemsResult['items'][number]>(item => {
    const resolution = item.resolution
    if (resolution.kind === 'pending') return []
    if (resolution.kind === 'awaiting_user_input') {
      const actual = references.routing[resolution.routingIndex]
      return actual && 'interaction' in actual
        ? [{ ...item, resolution: { kind: 'awaiting_user_input' as const, interaction: actual.interaction } }] : []
    }
    if (resolution.kind === 'registered_intent') {
      const actual = references.routing[resolution.routingIndex]
      return actual && 'registeredIntent' in actual
        ? [{ ...item, resolution: { kind: 'registered_intent' as const, intent: actual.registeredIntent } }] : []
    }
    return [{ ...item, resolution }]
  })
}
