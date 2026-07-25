import { BadRequestException } from '@nestjs/common'
import { CounterpartyType, ResourceKind } from '@prisma/client'

interface SegmentResourceCounterpartyInput {
  resourceKind: string
  partnerId?: string | null
  supplierId?: string | null
}

interface SegmentResourceCounterpartyExisting {
  counterpartyType: CounterpartyType
  partnerId: string | null
  supplierId: string | null
}

/**
 * 全部资源种类（含拼出）挂供应商；拼出对应供应商类别 outsource／旅行社。
 * 历史拼出行可能仍挂 Partner，读路径按 counterpartyType 处理；写路径不再接受 partnerId。
 */
export function resolveSegmentResourceCounterparty(
  input: SegmentResourceCounterpartyInput,
): {
  counterpartyType: CounterpartyType
  partnerId: string | null
  supplierId: string | null
} {
  if (!input.supplierId) {
    throw new BadRequestException('请选择供应商')
  }
  if (input.partnerId) {
    throw new BadRequestException('资源不能同时关联客户与供应商')
  }

  return {
    counterpartyType: CounterpartyType.supplier,
    partnerId: null,
    supplierId: input.supplierId,
  }
}

/**
 * 更新路径：新写仍统一走供应商；无供应商时保留历史 Partner 拼出行（ADR-0032，不强制迁移）。
 * 传入的 supplierId 应为 dto ?? existing（勿把历史 partnerId 并入 resolve，以免与 supplier 冲突）。
 */
export function resolveSegmentResourceCounterpartyForUpdate(input: {
  resourceKind: string
  partnerId?: string | null
  supplierId?: string | null
  existing: SegmentResourceCounterpartyExisting
}): {
  counterpartyType: CounterpartyType
  partnerId: string | null
  supplierId: string | null
} {
  if (input.supplierId) {
    return resolveSegmentResourceCounterparty({
      resourceKind: input.resourceKind,
      partnerId: input.partnerId,
      supplierId: input.supplierId,
    })
  }

  const canPreserveHistoricalPartner =
    input.existing.counterpartyType === CounterpartyType.partner &&
    Boolean(input.existing.partnerId) &&
    input.resourceKind === ResourceKind.outsource

  if (canPreserveHistoricalPartner) {
    if (input.partnerId && input.partnerId !== input.existing.partnerId) {
      throw new BadRequestException('写路径不再接受更换承接方，请选择供应商')
    }

    return {
      counterpartyType: CounterpartyType.partner,
      partnerId: input.existing.partnerId,
      supplierId: null,
    }
  }

  throw new BadRequestException('请选择供应商')
}
