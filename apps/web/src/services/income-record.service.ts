import { request } from '@/lib/request'
import type {
  CreateDepartureIncomeRecordDto,
  DepartureIncomeRecordListResult,
  DepartureIncomeRecordSummary,
  UpdateDepartureIncomeRecordDto,
} from '@/types/api'

export function listIncomeRecords(
  departureId: string,
  signal?: AbortSignal,
): Promise<DepartureIncomeRecordListResult> {
  return request.get<DepartureIncomeRecordListResult>(
    `/departures/${departureId}/income-records`,
    { signal },
  )
}

export async function createIncomeRecord(
  departureId: string,
  payload: CreateDepartureIncomeRecordDto,
): Promise<DepartureIncomeRecordSummary> {
  return await request.post<DepartureIncomeRecordSummary>(
    `/departures/${departureId}/income-records`,
    payload,
  )
}

export async function updateIncomeRecord(
  departureId: string,
  incomeRecordId: string,
  payload: UpdateDepartureIncomeRecordDto,
): Promise<DepartureIncomeRecordSummary> {
  return await request.patch<DepartureIncomeRecordSummary>(
    `/departures/${departureId}/income-records/${incomeRecordId}`,
    payload,
  )
}

export async function deleteIncomeRecord(
  departureId: string,
  incomeRecordId: string,
): Promise<void> {
  await request.delete(`/departures/${departureId}/income-records/${incomeRecordId}`)
}
