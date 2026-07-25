import { BadRequestException } from '@nestjs/common'
import type {
  SourceOrderCollectionMode,
  SourceOrderDiscountType,
} from '@prisma/client'
import {
  FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION,
  FareAdjustmentKind,
} from '@xiaotuanbao/shared'
import {
  computeSourceOrderAmounts,
  type SourceOrderAmountInput,
  type SourceOrderFareAdjustmentInput,
} from './source-order.utils'

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
  fareAdjustments?: SourceOrderFareAdjustmentInput[]
}

function isMissingUnitPrice(unitPriceCents: number | null | undefined): boolean {
  return unitPriceCents === undefined || unitPriceCents === null
}

const FIXED_KIND_DIRECTIONS = FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION as Record<
  string,
  'increase' | 'decrease'
>

function validateFareAdjustments(
  fareAdjustments: SourceOrderFareAdjustmentInput[] | undefined,
): void {
  if (!fareAdjustments || fareAdjustments.length === 0) {
    return
  }

  const seenFixedKinds = new Set<string>()

  for (const item of fareAdjustments) {
    if (!Object.values(FareAdjustmentKind).includes(item.kind as FareAdjustmentKind)) {
      throw new BadRequestException('团款调整种类无效')
    }

    if (item.direction !== 'increase' && item.direction !== 'decrease') {
      throw new BadRequestException('团款调整方向无效')
    }

    if (!Number.isInteger(item.amountCents) || item.amountCents <= 0) {
      throw new BadRequestException('团款调整项金额必须大于0')
    }

    if (item.kind === FareAdjustmentKind.CUSTOM) {
      if (!item.customName?.trim()) {
        throw new BadRequestException('自定义团款调整项必须填写名称')
      }
      continue
    }

    if (seenFixedKinds.has(item.kind)) {
      throw new BadRequestException('同一固定种类的团款调整项只能有一行')
    }
    seenFixedKinds.add(item.kind)

    const lockedDirection = FIXED_KIND_DIRECTIONS[item.kind]
    if (lockedDirection && item.direction !== lockedDirection) {
      throw new BadRequestException('固定种类的团款调整方向不可修改')
    }
  }
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

  validateFareAdjustments(input.fareAdjustments)

  const amounts = computeSourceOrderAmounts(input as SourceOrderAmountInput)

  if (amounts.netReceivableCents < 0) {
    throw new BadRequestException('结算金额不能为负数')
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
