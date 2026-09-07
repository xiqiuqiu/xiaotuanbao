import { BadRequestException } from '@nestjs/common'
import type { CreateSourceOrderDto, CreateSourceOrderGuestDto } from '../departure/dto/source-order.dto'
import type { AiReviewPackageView } from '@xiaotuanbao/shared'
import {
  SOURCE_ORDER_REVIEW_CONFIRMATION_UNIT,
  sourceOrderFareAdjustmentCandidateSchema,
  sourceOrderGuestCandidateSchema,
  submitReviewPackageInputSchema,
  submitSourceOrderReviewPackageInputSchema,
} from '@xiaotuanbao/ai-contracts'

export function parseSubmitReviewPackageInput(raw: unknown) {
  if (
    raw &&
    typeof raw === 'object' &&
    'confirmationUnit' in raw &&
    (raw as { confirmationUnit?: unknown }).confirmationUnit ===
      SOURCE_ORDER_REVIEW_CONFIRMATION_UNIT
  ) {
    return submitSourceOrderReviewPackageInputSchema.parse(raw)
  }
  return submitReviewPackageInputSchema.parse(raw)
}

export type SourceOrderReviewWriteInput = {
  dto: CreateSourceOrderDto
  guests: CreateSourceOrderGuestDto[]
}

export function valuesFromReviewPackage(pkg: {
  candidates: AiReviewPackageView['candidates']
}): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const candidate of pkg.candidates) {
    values[candidate.fieldKey] =
      candidate.userCorrectedValue !== undefined
        ? candidate.userCorrectedValue
        : candidate.proposedValue
  }
  return values
}

export function sourceOrderWriteFromReviewValues(
  values: Record<string, unknown>,
): SourceOrderReviewWriteInput {
  const missing: string[] = []
  const partnerId = requiredString(values.partnerId, '客户', missing)
  const adultGuestCount = requiredInt(values.adultGuestCount, '成人人数', missing)
  const childGuestCount = requiredInt(values.childGuestCount, '儿童人数', missing)
  const discountType = requiredEnum(
    values.discountType,
    ['none', 'lump_sum'] as const,
    '优惠方式',
    missing,
  )
  const collectionMode = requiredEnum(
    values.collectionMode,
    ['partner_settled', 'guest_only', 'split'] as const,
    '收款方式',
    missing,
  )

  if (values.fareAdjustments === null || values.fareAdjustments === undefined) {
    missing.push('团款调整')
  }

  const adultUnitPriceCents = optionalInt(values.adultUnitPriceCents)
  const childUnitPriceCents = optionalInt(values.childUnitPriceCents)
  if (adultGuestCount != null && adultGuestCount > 0 && adultUnitPriceCents == null) {
    missing.push('成人单价')
  }
  if (childGuestCount != null && childGuestCount > 0 && childUnitPriceCents == null) {
    missing.push('儿童单价')
  }

  let discountCents: number | undefined
  if (discountType === 'lump_sum') {
    discountCents = requiredInt(values.discountCents, '优惠金额', missing) ?? undefined
  } else if (discountType === 'none') {
    discountCents = 0
  }

  let depositCents: number | undefined
  let balanceCents: number | undefined
  if (collectionMode === 'guest_only' || collectionMode === 'split') {
    depositCents = requiredInt(values.depositCents, '定金', missing) ?? undefined
    balanceCents = requiredInt(values.balanceCents, '尾款', missing) ?? undefined
  } else if (collectionMode === 'partner_settled') {
    depositCents = 0
    balanceCents = 0
  }

  if (missing.length > 0) {
    throw new BadRequestException(`请先确认缺失项：${missing.join('、')}`)
  }

  const fareAdjustments = Array.isArray(values.fareAdjustments)
    ? values.fareAdjustments.map((row) => sourceOrderFareAdjustmentCandidateSchema.parse(row))
    : []

  const guests = Array.isArray(values.guests)
    ? values.guests.flatMap((row) => {
        const parsed = sourceOrderGuestCandidateSchema.parse(row)
        if (!parsed.name.trim() || parsed.included === false) {
          return []
        }
        return [
          {
            name: parsed.name.trim(),
            phone: parsed.phone?.trim() || undefined,
            gender: parsed.gender ?? undefined,
            notes: parsed.notes?.trim() || undefined,
          } satisfies CreateSourceOrderGuestDto,
        ]
      })
    : []

  const dto: CreateSourceOrderDto = {
    partnerId: partnerId!,
    adultGuestCount: adultGuestCount!,
    childGuestCount: childGuestCount!,
    adultUnitPriceCents,
    childUnitPriceCents,
    discountType: discountType!,
    discountCents,
    discountNotes: optionalString(values.discountNotes),
    collectionMode: collectionMode!,
    depositCents,
    balanceCents,
    settlementNotes: optionalString(values.settlementNotes),
    notes: optionalString(values.notes),
    fareAdjustments,
  }

  return { dto, guests }
}

function requiredString(value: unknown, label: string, missing: string[]): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    missing.push(label)
    return null
  }
  return value.trim()
}

function requiredInt(value: unknown, label: string, missing: string[]): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    missing.push(label)
    return null
  }
  return value
}

function optionalInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return undefined
  }
  return value
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requiredEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
  missing: string[],
): T | null {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    missing.push(label)
    return null
  }
  return value as T
}
