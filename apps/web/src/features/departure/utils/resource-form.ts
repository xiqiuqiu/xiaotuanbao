import { ResourceKind } from '@xiaotuanbao/shared'
import type {
  CreateDepartureResourceDto,
  CreateSegmentResourceDto,
  DepartureResourceSummary,
  SegmentResourceSummary,
} from '@/types/api'

export type ResourceSummaryForForm = SegmentResourceSummary | DepartureResourceSummary

export type ResourceFormPayload = CreateSegmentResourceDto | CreateDepartureResourceDto

export interface ResourceFormValues {
  resourceKind: ResourceKind
  partnerId?: string
  supplierId?: string
  title?: string
  amountYuan: number
  notes?: string
}

export function createEmptyResourceFormValues(): ResourceFormValues {
  return {
    resourceKind: ResourceKind.TRANSPORT,
    amountYuan: 0,
  }
}

export function resourceToFormValues(resource: ResourceSummaryForForm): ResourceFormValues {
  return {
    resourceKind: resource.resourceKind as ResourceKind,
    partnerId: resource.partnerId ?? undefined,
    supplierId: resource.supplierId ?? undefined,
    title: resource.title || undefined,
    amountYuan: resource.amountCents / 100,
    notes: resource.notes ?? undefined,
  }
}

export function formValuesToPayload(values: ResourceFormValues): ResourceFormPayload {
  const amountCents = Math.round(values.amountYuan * 100)
  return {
    resourceKind: values.resourceKind,
    supplierId: values.supplierId,
    title: values.title?.trim() || undefined,
    amountCents,
    notes: values.notes?.trim() || undefined,
  }
}
