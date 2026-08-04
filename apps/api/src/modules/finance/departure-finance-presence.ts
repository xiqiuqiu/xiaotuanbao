import {
  PaymentScheduleDirection,
  type Prisma,
} from '@prisma/client'
import {
  PaymentScheduleSourceType,
  SOURCE_ORDER_RECEIVABLE_SOURCE_TYPES,
} from '@xiaotuanbao/shared'

/** Whether a business source blocks deletion / counts as obligation-generated. */
export type FinanceSourcePresence = {
  /** Any schedule history (including voided) — blocks deleting the source. */
  blocksRemoval: boolean
  /**
   * Obligation considered generated for pending-gap / batch candidates.
   * Receivable: any path schedule. Payable: any non-voided schedule.
   */
  isGenerated: boolean
}

export type ResourcePresenceSourceType =
  | typeof PaymentScheduleSourceType.SEGMENT_RESOURCE
  | typeof PaymentScheduleSourceType.DEPARTURE_RESOURCE

export type ResourcePresenceKey = {
  sourceType: ResourcePresenceSourceType
  sourceId: string
}

export const EMPTY_FINANCE_SOURCE_PRESENCE: FinanceSourcePresence = {
  blocksRemoval: false,
  isGenerated: false,
}

export function resourcePresenceMapKey(
  sourceType: ResourcePresenceSourceType,
  sourceId: string,
): string {
  return `${sourceType}:${sourceId}`
}

type PresenceScheduleRow = {
  sourceId: string | null
  sourceType: string
  voidedAt: Date | null
}

export function deriveFinanceSourcePresence(
  rows: ReadonlyArray<Pick<PresenceScheduleRow, 'voidedAt'>>,
  options: {
    /** When true, only non-voided rows count as generated (resource payable). */
    generatedRequiresNonVoided: boolean
  },
): FinanceSourcePresence {
  if (rows.length === 0) {
    return { ...EMPTY_FINANCE_SOURCE_PRESENCE }
  }
  const blocksRemoval = true
  const isGenerated = options.generatedRequiresNonVoided
    ? rows.some((row) => row.voidedAt == null)
    : true
  return { blocksRemoval, isGenerated }
}

/** Minimal Prisma surface used by presence loaders (keeps Facade free of query details). */
type PaymentScheduleReader = {
  paymentSchedule: {
    findMany: (args: {
      where: Prisma.PaymentScheduleWhereInput
      select: { sourceId: true; sourceType: true; voidedAt: true }
    }) => Promise<PresenceScheduleRow[]>
  }
}

export async function loadSourceOrderFinancePresences(
  prisma: PaymentScheduleReader,
  organizationId: string,
  sourceOrderIds: string[],
): Promise<Map<string, FinanceSourcePresence>> {
  const result = new Map<string, FinanceSourcePresence>()
  for (const id of sourceOrderIds) {
    result.set(id, { ...EMPTY_FINANCE_SOURCE_PRESENCE })
  }
  if (sourceOrderIds.length === 0) {
    return result
  }

  const rows = await prisma.paymentSchedule.findMany({
    where: {
      organizationId,
      direction: PaymentScheduleDirection.receivable,
      sourceType: { in: [...SOURCE_ORDER_RECEIVABLE_SOURCE_TYPES] },
      sourceId: { in: sourceOrderIds },
    },
    select: { sourceId: true, sourceType: true, voidedAt: true },
  })

  const bySource = new Map<string, PresenceScheduleRow[]>()
  for (const row of rows) {
    if (!row.sourceId) continue
    const list = bySource.get(row.sourceId) ?? []
    list.push(row)
    bySource.set(row.sourceId, list)
  }

  for (const id of sourceOrderIds) {
    result.set(
      id,
      deriveFinanceSourcePresence(bySource.get(id) ?? [], {
        // Receivable void is not a v1 path (ADR-0007); any row ⇒ generated.
        generatedRequiresNonVoided: false,
      }),
    )
  }
  return result
}

export async function loadResourceFinancePresences(
  prisma: PaymentScheduleReader,
  organizationId: string,
  keys: ResourcePresenceKey[],
): Promise<Map<string, FinanceSourcePresence>> {
  const result = new Map<string, FinanceSourcePresence>()
  for (const key of keys) {
    result.set(resourcePresenceMapKey(key.sourceType, key.sourceId), {
      ...EMPTY_FINANCE_SOURCE_PRESENCE,
    })
  }
  if (keys.length === 0) {
    return result
  }

  const sourceIds = [...new Set(keys.map((key) => key.sourceId))]
  const sourceTypes = [
    ...new Set(keys.map((key) => key.sourceType)),
  ] as ResourcePresenceSourceType[]

  const rows = await prisma.paymentSchedule.findMany({
    where: {
      organizationId,
      direction: PaymentScheduleDirection.payable,
      sourceType: { in: sourceTypes },
      sourceId: { in: sourceIds },
    },
    select: { sourceId: true, sourceType: true, voidedAt: true },
  })

  const byKey = new Map<string, PresenceScheduleRow[]>()
  for (const row of rows) {
    if (!row.sourceId) continue
    if (
      row.sourceType !== PaymentScheduleSourceType.SEGMENT_RESOURCE &&
      row.sourceType !== PaymentScheduleSourceType.DEPARTURE_RESOURCE
    ) {
      continue
    }
    const mapKey = resourcePresenceMapKey(row.sourceType, row.sourceId)
    const list = byKey.get(mapKey) ?? []
    list.push(row)
    byKey.set(mapKey, list)
  }

  for (const key of keys) {
    const mapKey = resourcePresenceMapKey(key.sourceType, key.sourceId)
    result.set(
      mapKey,
      deriveFinanceSourcePresence(byKey.get(mapKey) ?? [], {
        generatedRequiresNonVoided: true,
      }),
    )
  }
  return result
}
