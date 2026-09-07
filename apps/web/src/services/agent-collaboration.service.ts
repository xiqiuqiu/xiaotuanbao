import { request } from '@/lib/request'
import type {
  AcceptReviewConfirmationDto,
  DepartureCollaborationView,
  ReviewConfirmationView,
} from '@/types/api'

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
