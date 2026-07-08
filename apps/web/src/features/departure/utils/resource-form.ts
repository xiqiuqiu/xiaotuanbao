import { ResourceKind } from '@xiaotuanbao/shared'
import type { CreateSegmentResourceDto, SegmentResourceSummary } from '@/types/api'

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

export function resourceToFormValues(resource: SegmentResourceSummary): ResourceFormValues {
  return {
    resourceKind: resource.resourceKind as ResourceKind,
    partnerId: resource.partnerId ?? undefined,
    supplierId: resource.supplierId ?? undefined,
    title: resource.title || undefined,
    amountYuan: resource.amountCents / 100,
    notes: resource.notes ?? undefined,
  }
}

export function formValuesToPayload(values: ResourceFormValues): CreateSegmentResourceDto {
  const amountCents = Math.round(values.amountYuan * 100)
  return {
    resourceKind: values.resourceKind,
    ...(values.resourceKind === ResourceKind.OUTSOURCE
      ? { partnerId: values.partnerId }
      : { supplierId: values.supplierId }),
    title: values.title?.trim() || undefined,
    amountCents,
    notes: values.notes?.trim() || undefined,
  }
}

export function isOutsourceKind(resourceKind: ResourceKind | undefined): boolean {
  return resourceKind === ResourceKind.OUTSOURCE
}
