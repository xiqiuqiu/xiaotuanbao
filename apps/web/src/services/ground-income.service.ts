import { request } from '@/lib/request'
import type {
  CreateGroundIncomeDto,
  GroundIncomeListResult,
  GroundIncomeSummary,
  UpdateGroundIncomeDto,
} from '@/types/api'

export function listGroundIncomes(
  departureId: string,
  signal?: AbortSignal,
): Promise<GroundIncomeListResult> {
  return request.get<GroundIncomeListResult>(
    `/departures/${departureId}/ground-incomes`,
    { signal },
  )
}

export async function createGroundIncome(
  departureId: string,
  payload: CreateGroundIncomeDto,
): Promise<GroundIncomeSummary> {
  return await request.post<GroundIncomeSummary>(
    `/departures/${departureId}/ground-incomes`,
    payload,
  )
}

export async function updateGroundIncome(
  departureId: string,
  groundIncomeId: string,
  payload: UpdateGroundIncomeDto,
): Promise<GroundIncomeSummary> {
  return await request.patch<GroundIncomeSummary>(
    `/departures/${departureId}/ground-incomes/${groundIncomeId}`,
    payload,
  )
}

export async function deleteGroundIncome(
  departureId: string,
  groundIncomeId: string,
): Promise<void> {
  await request.delete(
    `/departures/${departureId}/ground-incomes/${groundIncomeId}`,
  )
}
