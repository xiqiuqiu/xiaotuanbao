import { BadRequestException } from '@nestjs/common'
import type {
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'
import { computeSourceOrderAmounts, type SourceOrderAmountInput } from './source-order.utils'

export interface SourceOrderValidationInput {
  partnerId?: string
  guestCount: number
  unitPriceCents: number
  discountType: SourceOrderDiscountType
  discountCents: number
  collectionMode: SourceOrderCollectionMode
  partnerCollectedCents: number
}

export function validateSourceOrderInput(input: SourceOrderValidationInput): void {
  if (!input.partnerId) {
    throw new BadRequestException('请选择客户')
  }

  if (input.guestCount < 1) {
    throw new BadRequestException('客人人数必须大于0')
  }

  if (input.unitPriceCents < 0) {
    throw new BadRequestException('原始团款单价不能为负数')
  }

  const amounts = computeSourceOrderAmounts(input as SourceOrderAmountInput)

  if (amounts.discountCents > amounts.grossReceivableCents) {
    throw new BadRequestException('优惠金额不能大于原始应收')
  }

  if (amounts.partnerCollectedCents > amounts.netReceivableCents) {
    throw new BadRequestException('客户已收金额不能大于结算金额')
  }

  if (input.collectionMode === 'split') {
    const expectedGuestCollect = amounts.netReceivableCents - input.partnerCollectedCents
    if (amounts.guestCollectCents !== expectedGuestCollect) {
      throw new BadRequestException('我方代收需等于结算金额减客户已收')
    }
  }
}
