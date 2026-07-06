import { request } from '@/lib/request'
import type { EmployeeListResult, EmployeeSummary } from '@/types/api'
import type { UserStatus } from '@xiaotuanbao/shared'

export interface ListEmployeesParams {
  search?: string
  status?: UserStatus
  roleId?: string
  page?: number
  pageSize?: number
}

export interface CreateEmployeePayload {
  username: string
  name: string
  remark?: string
  roleId: string
  status: UserStatus
  password: string
}

export interface UpdateEmployeePayload {
  name: string
  remark?: string
  roleId: string
  status: UserStatus
}

export async function listEmployees(params: ListEmployeesParams): Promise<EmployeeListResult> {
  return request.get<EmployeeListResult>('/users', { params })
}

export async function createEmployee(payload: CreateEmployeePayload): Promise<EmployeeSummary> {
  return request.post<EmployeeSummary>('/users', payload)
}

export async function updateEmployee(
  id: string,
  payload: UpdateEmployeePayload,
): Promise<EmployeeSummary> {
  return request.patch<EmployeeSummary>(`/users/${id}`, payload)
}

export async function disableEmployee(id: string): Promise<EmployeeSummary> {
  return request.post<EmployeeSummary>(`/users/${id}/disable`)
}
