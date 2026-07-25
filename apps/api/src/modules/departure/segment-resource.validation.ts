import { BadRequestException } from '@nestjs/common'
import { CounterpartyType } from '@prisma/client'

interface SegmentResourceCounterpartyInput {
  resourceKind: string
  partnerId?: string | null
  supplierId?: string | null
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
