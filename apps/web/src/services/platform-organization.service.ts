import { request } from '@/lib/request'
import type {
  CreatePlatformOrganizationDto,
  PlatformOrganizationListResult,
  PlatformOrganizationProfile,
  UpdatePlatformOrganizationDto,
} from '@/types/api'

export interface ListPlatformOrganizationsParams {
  page?: number
  pageSize?: number
}

export async function listPlatformOrganizations(
  params: ListPlatformOrganizationsParams = {},
): Promise<PlatformOrganizationListResult> {
  return request.get<PlatformOrganizationListResult>('/platform/organizations', { params })
}

export async function getPlatformOrganization(
  id: string,
): Promise<PlatformOrganizationProfile> {
  return request.get<PlatformOrganizationProfile>(`/platform/organizations/${id}`)
}

export async function createPlatformOrganization(
  payload: CreatePlatformOrganizationDto,
): Promise<PlatformOrganizationProfile> {
  return request.post<PlatformOrganizationProfile>('/platform/organizations', payload)
}

export async function updatePlatformOrganization(
  id: string,
  payload: UpdatePlatformOrganizationDto,
): Promise<PlatformOrganizationProfile> {
  return request.patch<PlatformOrganizationProfile>(`/platform/organizations/${id}`, payload)
}
