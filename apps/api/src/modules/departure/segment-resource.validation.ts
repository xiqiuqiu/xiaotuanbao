import { BadRequestException } from '@nestjs/common'
import { CounterpartyType, ResourceKind } from '@prisma/client'

interface SegmentResourceCounterpartyInput {
  resourceKind: ResourceKind
  partnerId?: string | null
  supplierId?: string | null
}

export function resolveSegmentResourceCounterparty(
  input: SegmentResourceCounterpartyInput,
): {
  counterpartyType: CounterpartyType
  partnerId: string | null
  supplierId: string | null
} {
  if (input.resourceKind === ResourceKind.outsource) {
    if (!input.partnerId) {
      throw new BadRequestException('请选择承接方')
    }
    if (input.supplierId) {
      throw new BadRequestException('拼出资源不能关联供应商')
    }
    return {
      counterpartyType: CounterpartyType.partner,
      partnerId: input.partnerId,
      supplierId: null,
    }
  }

  if (!input.supplierId) {
    throw new BadRequestException('请选择供应商')
  }
  if (input.partnerId) {
    throw new BadRequestException('非拼出资源不能关联客户')
  }

  return {
    counterpartyType: CounterpartyType.supplier,
    partnerId: null,
    supplierId: input.supplierId,
  }
}
