import type {
  DepartureIncomeSettlementComposite,
  DepartureIncomeType,
} from '@xiaotuanbao/shared'
import { request } from '@/lib/request'
import type {
  CreateDepartureIncomeRecordDto,
  DepartureIncomeRecordListResult,
  DepartureIncomeRecordSummary,
  UpdateDepartureIncomeRecordDto,
} from '@/types/api'

export type ListIncomeRecordsParams = {
  type?: DepartureIncomeType
  settlementComposite?: DepartureIncomeSettlementComposite
  keyword?: string
}

export function listIncomeRecords(
  departureId: string,
  params?: ListIncomeRecordsParams,
  signal?: AbortSignal,
): Promise<DepartureIncomeRecordListResult> {
  return request.get<DepartureIncomeRecordListResult>(
    `/departures/${departureId}/income-records`,
    { params, signal },
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
