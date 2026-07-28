import { request } from '@/lib/request'
import type {
  CreateItinerarySegmentDto,
  GenerateDailySegmentsDto,
  GenerateDailySegmentsResult,
  ItinerarySegmentListResult,
  ItinerarySegmentSummary,
  UpdateItinerarySegmentDto,
} from '@/types/api'

export async function listSegments(departureId: string): Promise<ItinerarySegmentListResult> {
  return request.get<ItinerarySegmentListResult>(`/departures/${departureId}/segments`)
}

export async function createSegment(
  departureId: string,
  payload: CreateItinerarySegmentDto,
): Promise<ItinerarySegmentSummary> {
  return request.post<ItinerarySegmentSummary>(`/departures/${departureId}/segments`, payload)
}

export async function generateDailySegments(
  departureId: string,
  payload: GenerateDailySegmentsDto = {},
): Promise<GenerateDailySegmentsResult> {
  return request.post<GenerateDailySegmentsResult>(
    `/departures/${departureId}/segments/generate-daily`,
    payload,
  )
}

export async function getSegment(id: string): Promise<ItinerarySegmentSummary> {
  return request.get<ItinerarySegmentSummary>(`/segments/${id}`)
}

export async function updateSegment(
  id: string,
  payload: UpdateItinerarySegmentDto,
): Promise<ItinerarySegmentSummary> {
  return request.patch<ItinerarySegmentSummary>(`/segments/${id}`, payload)
}

export async function deleteSegment(id: string): Promise<void> {
  await request.delete(`/segments/${id}`)
}
