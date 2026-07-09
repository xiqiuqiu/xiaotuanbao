import { BadRequestException } from '@nestjs/common'
import type {
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'
import { computeSourceOrderAmounts, type SourceOrderAmountInput } from './source-order.utils'

export interface SourceOrderValidationInput {
  partnerId?: string
  adultGuestCount: number
  childGuestCount: number
  adultUnitPriceCents?: number | null
  childUnitPriceCents?: number | null
  discountType: SourceOrderDiscountType
  discountCents: number
  collectionMode: SourceOrderCollectionMode
  partnerCollectedCents: number
}

function isMissingUnitPrice(unitPriceCents: number | null | undefined): boolean {
  return unitPriceCents === undefined || unitPriceCents === null
}

export function validateSourceOrderInput(input: SourceOrderValidationInput): void {
  if (!input.partnerId) {
    throw new BadRequestException('请选择客户')
  }

  if (input.adultGuestCount < 0) {
    throw new BadRequestException('成人人数不能为负数')
  }

  if (input.childGuestCount < 0) {
    throw new BadRequestException('儿童人数不能为负数')
  }

  if (input.adultGuestCount + input.childGuestCount < 1) {
    throw new BadRequestException('总人数必须大于0')
  }

  if (input.adultGuestCount > 0 && isMissingUnitPrice(input.adultUnitPriceCents)) {
    throw new BadRequestException('成人团款单价不能为空')
  }

  if (input.childGuestCount > 0 && isMissingUnitPrice(input.childUnitPriceCents)) {
    throw new BadRequestException('儿童团款单价不能为空')
  }

  if (input.adultUnitPriceCents != null && input.adultUnitPriceCents < 0) {
    throw new BadRequestException('成人团款单价不能为负数')
  }

  if (input.childUnitPriceCents != null && input.childUnitPriceCents < 0) {
    throw new BadRequestException('儿童团款单价不能为负数')
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
