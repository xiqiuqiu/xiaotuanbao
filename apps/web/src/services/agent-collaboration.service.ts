import { request } from '@/lib/request'
import type {
  AcceptReviewConfirmationDto,
  AiReviewPackageView,
  DepartureCollaborationView,
  PrepareSourceOrderReceivableReviewDto,
  ReviewConfirmationView,
  ReviewRevisionView,
} from '@/types/api'

export async function listReviewRevisions(packageId: string): Promise<ReviewRevisionView[]> {
  return request.get<ReviewRevisionView[]>(`/agent/review-packages/${packageId}/revisions`)
}

export async function getDepartureCollaboration(
  departureId: string,
  conversationId?: string,
): Promise<DepartureCollaborationView> {
  return request.get<DepartureCollaborationView>(`/agent/departures/${departureId}/collaboration`, {
    params: conversationId ? { conversationId } : undefined,
  })
}

export async function acceptReviewConfirmation(
  payload: AcceptReviewConfirmationDto,
): Promise<ReviewConfirmationView> {
  return request.post<ReviewConfirmationView>('/agent/review-decisions', payload)
}

export async function getReviewConfirmation(
  decisionCommandId: string,
): Promise<ReviewConfirmationView> {
  return request.get<ReviewConfirmationView>(`/agent/review-decisions/${decisionCommandId}`)
}

export async function prepareSourceOrderReceivableReview(
  departureId: string,
  payload: PrepareSourceOrderReceivableReviewDto,
): Promise<AiReviewPackageView> {
  return request.post<AiReviewPackageView>(
    `/agent/departures/${departureId}/source-order-receivable-reviews`,
    payload,
  )
}
