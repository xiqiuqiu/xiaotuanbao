import { Injectable } from '@nestjs/common'
import {
  PaymentScheduleSourceType,
  isSourceOrderGuestCollectionSourceType,
  type DepartureCompletionTags,
} from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'
import { DepartureFinanceFacade } from '../finance/departure-finance-facade.service'
import { emptyDepartureFinanceObligationSummary } from '../finance/departure-finance-obligation-summary'
import {
  buildDepartureReadModelAggregate,
  emptyDepartureReadModelAggregate,
  type DepartureReadModelAggregate,
  type DepartureOverviewSourceFacts,
  type SourceOrderAggregate,
  EMPTY_OVERVIEW_COLLECTION_STATS,
} from './departure-read-model.utils'
import {
  aggregateDepartureOverviewCollectionStats,
  type DepartureOverviewSourceOrderCollectionInput,
} from './departure-overview-collection-stats'

interface SegmentRollup {
  segmentCount: number
  resourceCount: number
  payableCents: number
  resources: Array<{
    id: string
    amountCents: number
    anchor: 'segment' | 'departure'
  }>
}

interface SourceOrderPathFact {
  id: string
  departureId: string
  collectionMode: string
  depositCents: number
  balanceCents: number
  netReceivableCents: number
  partnerCollectedCents: number
  guestCollectCents: number
}

@Injectable()
export class DepartureReadModelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departureFinanceFacade: DepartureFinanceFacade,
  ) {}

  async getForDeparture(
    organizationId: string,
    departureId: string,
    options: { includeOverviewStats?: boolean } = { includeOverviewStats: true },
  ): Promise<DepartureReadModelAggregate> {
    const map = await this.batchGetForDepartures(organizationId, [departureId], {
      includeOverviewStats: options.includeOverviewStats ?? true,
    })
    return map.get(departureId) ?? emptyDepartureReadModelAggregate()
  }

  async batchGetForDepartures(
    organizationId: string,
    departureIds: string[],
    options: { includeOverviewStats?: boolean } = {},
  ): Promise<Map<string, DepartureReadModelAggregate>> {
    const result = new Map<string, DepartureReadModelAggregate>()
    if (departureIds.length === 0) {
      return result
    }

    const uniqueIds = [...new Set(departureIds)]
    const includeOverviewStats = options.includeOverviewStats ?? false

    const [
      sourceOrderMap,
      segmentRollupMap,
      financeBundleMap,
      sourceOrderPathFacts,
      additionalIncomeNetTotals,
    ] = await Promise.all([
      this.batchSourceOrderAggregates(uniqueIds),
      this.batchSegmentRollups(uniqueIds),
      // Finance reads only via Facade (ADR-0004 C4): snapshot + obligation summary.
      this.departureFinanceFacade.getDepartureFinanceReadBundles(organizationId, uniqueIds),
      includeOverviewStats
        ? this.loadSourceOrderPathFacts(organizationId, uniqueIds)
        : Promise.resolve([]),
      includeOverviewStats
        ? this.batchAdditionalIncomeNetTotals(organizationId, uniqueIds)
        : Promise.resolve(new Map<string, number>()),
    ])

    const overviewSourceFactsMap = new Map<string, DepartureOverviewSourceFacts>()
    if (includeOverviewStats) {
      const resources = [...segmentRollupMap.values()].flatMap((rollup) => rollup.resources)
      const segmentResources = resources.filter((resource) => resource.anchor === 'segment')
      const departureResources = resources.filter((resource) => resource.anchor === 'departure')
      const [sourceOrderStates, segmentResourceStates, departureResourceStates] =
        await Promise.all([
          this.departureFinanceFacade.getSourceOrderPathFinanceStates(
            organizationId,
            sourceOrderPathFacts.map((fact) => fact.id),
            new Map(
              sourceOrderPathFacts.map((fact) => [
                fact.id,
                {
                  collectionMode: fact.collectionMode,
                  depositCents: fact.depositCents,
                  balanceCents: fact.balanceCents,
                  netReceivableCents: fact.netReceivableCents,
                  partnerCollectedCents: fact.partnerCollectedCents,
                  guestCollectCents: fact.guestCollectCents,
                },
              ]),
            ),
          ),
          this.departureFinanceFacade.getSegmentResourceFinanceStates(
            organizationId,
            segmentResources.map((resource) => resource.id),
            new Map(segmentResources.map((resource) => [resource.id, resource.amountCents])),
          ),
          this.departureFinanceFacade.getDepartureResourceFinanceStates(
            organizationId,
            departureResources.map((resource) => resource.id),
            new Map(departureResources.map((resource) => [resource.id, resource.amountCents])),
          ),
        ])
      const resourceStates = new Map([
        ...segmentResourceStates,
        ...departureResourceStates,
      ])

      const collectionInputsByDeparture = new Map<
        string,
        DepartureOverviewSourceOrderCollectionInput[]
      >()
      for (const departureId of uniqueIds) {
        overviewSourceFactsMap.set(departureId, {
          sourceReceivableUngeneratedCents: 0,
          generatedResourceAgreedCents: 0,
          additionalIncomeNetCents: additionalIncomeNetTotals.get(departureId) ?? 0,
          collectionStats: { ...EMPTY_OVERVIEW_COLLECTION_STATS },
        })
        collectionInputsByDeparture.set(departureId, [])
      }
      for (const fact of sourceOrderPathFacts) {
        const sourceFacts = overviewSourceFactsMap.get(fact.departureId)!
        const states = sourceOrderStates.get(fact.id) ?? []
        const customerState = states.find(
          (state) =>
            state.pathType ===
            PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
        )
        const depositState = states.find(
          (state) =>
            state.pathType ===
            PaymentScheduleSourceType.SOURCE_ORDER_GUEST_DEPOSIT_COLLECTION,
        )
        const balanceState = states.find(
          (state) =>
            state.pathType ===
            PaymentScheduleSourceType.SOURCE_ORDER_GUEST_BALANCE_COLLECTION,
        )

        const guestReceivedCents = states
          .filter((state) => isSourceOrderGuestCollectionSourceType(state.pathType))
          .reduce((sum, state) => sum + (state.receivedCents ?? 0), 0)
        const customerSettlementReceivedCents = customerState?.receivedCents ?? 0
        collectionInputsByDeparture.get(fact.departureId)!.push({
          settlementAmountCents: fact.netReceivableCents,
          guestAgreedCents: fact.guestCollectCents,
          guestReceivedCents,
          customerSettlementReceivedCents,
        })

        if (fact.collectionMode === 'partner_settled') {
          if (!customerState?.hasSchedule) {
            sourceFacts.sourceReceivableUngeneratedCents += fact.netReceivableCents
          }
          continue
        }

        // 代收场景：未生成计缺失的定金/尾款 Guest 期次；S−G约定>0 时另计客户补款。
        // 不加 >0 门槛，以保全 legacy-corrupt 负金额（与 partner_settled 的 net 口径一致）。
        if (fact.collectionMode === 'guest_only' && !depositState?.hasSchedule) {
          sourceFacts.sourceReceivableUngeneratedCents += fact.depositCents
        }
        if (
          (fact.collectionMode === 'guest_only' || fact.collectionMode === 'split') &&
          !balanceState?.hasSchedule
        ) {
          sourceFacts.sourceReceivableUngeneratedCents += fact.balanceCents
        }
        const agreedTopUpCents = Math.max(0, fact.netReceivableCents - fact.guestCollectCents)
        if (agreedTopUpCents > 0 && !customerState?.hasSchedule) {
          sourceFacts.sourceReceivableUngeneratedCents += agreedTopUpCents
        }
      }
      for (const [departureId, orders] of collectionInputsByDeparture) {
        const sourceFacts = overviewSourceFactsMap.get(departureId)!
        sourceFacts.collectionStats = aggregateDepartureOverviewCollectionStats(orders)
      }
      for (const [departureId, rollup] of segmentRollupMap) {
        const sourceFacts = overviewSourceFactsMap.get(departureId)!
        for (const resource of rollup.resources) {
          if (resourceStates.get(resource.id)?.hasSchedule) {
            sourceFacts.generatedResourceAgreedCents += resource.amountCents
          }
        }
      }
    }

    for (const departureId of uniqueIds) {
      const sourceOrders = sourceOrderMap.get(departureId) ?? {
        count: 0,
        totalGuests: 0,
        grossReceivableCents: 0,
        fareAdjustmentNetCents: 0,
        discountCents: 0,
        netReceivableCents: 0,
      }
      const rollup = segmentRollupMap.get(departureId) ?? {
        segmentCount: 0,
        resourceCount: 0,
        payableCents: 0,
        resources: [],
      }
      const financeBundle = financeBundleMap.get(departureId)
      const financeSnapshot = includeOverviewStats
        ? financeBundle?.snapshot
        : undefined
      const obligationSummary =
        financeBundle?.obligationSummary ?? emptyDepartureFinanceObligationSummary()

      result.set(
        departureId,
        buildDepartureReadModelAggregate({
          sourceOrders,
          segmentCount: rollup.segmentCount,
          resourceCount: rollup.resourceCount,
          payableCents: rollup.payableCents,
          obligationSummary,
          financeSnapshot,
          overviewSourceFacts: overviewSourceFactsMap.get(departureId),
        }),
      )
    }

    return result
  }

  async batchGetOwnerNames(ownerUserIds: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(ownerUserIds)]
    if (uniqueIds.length === 0) {
      return new Map()
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds }, deletedAt: null },
      select: { id: true, name: true },
    })

    return new Map(users.map((user) => [user.id, user.name]))
  }

  private async batchSourceOrderAggregates(
    departureIds: string[],
  ): Promise<Map<string, SourceOrderAggregate>> {
    const rows = await this.prisma.sourceOrder.groupBy({
      by: ['departureId'],
      where: { departureId: { in: departureIds } },
      _count: { id: true },
      _sum: {
        guestCount: true,
        grossReceivableCents: true,
        fareAdjustmentNetCents: true,
        discountCents: true,
        netReceivableCents: true,
      },
    })

    const map = new Map<string, SourceOrderAggregate>()
    for (const row of rows) {
      map.set(row.departureId, {
        count: row._count.id,
        totalGuests: row._sum.guestCount ?? 0,
        grossReceivableCents: row._sum.grossReceivableCents ?? 0,
        fareAdjustmentNetCents: row._sum.fareAdjustmentNetCents ?? 0,
        discountCents: row._sum.discountCents ?? 0,
        netReceivableCents: row._sum.netReceivableCents ?? 0,
      })
    }
    return map
  }

  private loadSourceOrderPathFacts(
    organizationId: string,
    departureIds: string[],
  ): Promise<SourceOrderPathFact[]> {
    return this.prisma.sourceOrder.findMany({
      where: {
        departureId: { in: departureIds },
        departure: { organizationId },
      },
      select: {
        id: true,
        departureId: true,
        collectionMode: true,
        depositCents: true,
        balanceCents: true,
        netReceivableCents: true,
        partnerCollectedCents: true,
        guestCollectCents: true,
      },
    })
  }

  /** 增收净收益 = Σ(增收金额 − 导游提成) = Σ增收 − Σ提成 */
  private async batchAdditionalIncomeNetTotals(
    organizationId: string,
    departureIds: string[],
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.departureIncomeRecord.groupBy({
      by: ['departureId'],
      where: {
        departureId: { in: departureIds },
        departure: { organizationId },
      },
      _sum: { amountCents: true, commissionCents: true },
    })
    return new Map(
      rows.map((row) => [
        row.departureId,
        (row._sum.amountCents ?? 0) - (row._sum.commissionCents ?? 0),
      ]),
    )
  }

  private async batchSegmentRollups(departureIds: string[]): Promise<Map<string, SegmentRollup>> {
    const [segments, departureResources] = await Promise.all([
      this.prisma.itinerarySegment.findMany({
        where: { departureId: { in: departureIds } },
        select: {
          id: true,
          departureId: true,
          resources: {
            select: { id: true, amountCents: true },
          },
        },
      }),
      this.prisma.departureResource.findMany({
        where: { departureId: { in: departureIds } },
        select: { id: true, departureId: true, amountCents: true },
      }),
    ])

    const map = new Map<string, SegmentRollup>()
    for (const departureId of departureIds) {
      map.set(departureId, {
        segmentCount: 0,
        resourceCount: 0,
        payableCents: 0,
        resources: [],
      })
    }

    for (const segment of segments) {
      const rollup = map.get(segment.departureId)!
      rollup.segmentCount += 1
      rollup.resourceCount += segment.resources.length
      rollup.payableCents += segment.resources.reduce(
        (sum, resource) => sum + resource.amountCents,
        0,
      )
      rollup.resources.push(
        ...segment.resources.map((resource) => ({
          ...resource,
          anchor: 'segment' as const,
        })),
      )
    }

    for (const resource of departureResources) {
      const rollup = map.get(resource.departureId)!
      rollup.resourceCount += 1
      rollup.payableCents += resource.amountCents
      rollup.resources.push({
        id: resource.id,
        amountCents: resource.amountCents,
        anchor: 'departure',
      })
    }

    return map
  }
}

export type { DepartureReadModelAggregate, DepartureCompletionTags }
