import { Injectable } from '@nestjs/common'
import {
  PaymentScheduleSourceType,
  ResourceKind,
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
import {
  buildDepartureOverviewBSupplement,
  EMPTY_OVERVIEW_B_SUPPLEMENT,
} from './departure-overview-b-supplement'
import { getShanghaiTodayString } from './departure-date.utils'

interface SegmentRollup {
  segmentCount: number
  resourceCount: number
  payableCents: number
  segments: Array<{
    id: string
    resourceCount: number
    outsourceCount: number
    resourceAmountCents: number
    resources: Array<{ id: string; amountCents: number; resourceKind: string }>
  }>
  resources: Array<{
    id: string
    amountCents: number
    resourceKind: string
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
  guestCount: number
  recordedGuestCount: number
}

interface AdditionalIncomeTotals {
  netCents: number
  grossCents: number
  expenseCents: number
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
      additionalIncomeTotals,
    ] = await Promise.all([
      this.batchSourceOrderAggregates(uniqueIds),
      this.batchSegmentRollups(uniqueIds),
      // Finance reads only via Facade (ADR-0004 C4): snapshot + obligation summary.
      this.departureFinanceFacade.getDepartureFinanceReadBundles(organizationId, uniqueIds),
      includeOverviewStats
        ? this.loadSourceOrderPathFacts(organizationId, uniqueIds)
        : Promise.resolve([] as SourceOrderPathFact[]),
      includeOverviewStats
        ? this.batchAdditionalIncomeTotals(organizationId, uniqueIds)
        : Promise.resolve(new Map<string, AdditionalIncomeTotals>()),
    ])

    const overviewSourceFactsMap = new Map<string, DepartureOverviewSourceFacts>()
    if (includeOverviewStats) {
      const resources = [...segmentRollupMap.values()].flatMap((rollup) => rollup.resources)
      const segmentResources = resources.filter((resource) => resource.anchor === 'segment')
      const departureResources = resources.filter((resource) => resource.anchor === 'departure')
      const [sourceOrderFinanceStates, segmentResourceStates, departureResourceStates] =
        await Promise.all([
          this.departureFinanceFacade.getSourceOrderFinanceStates(
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
      const sourceOrdersByDeparture = new Map<string, SourceOrderPathFact[]>()
      for (const departureId of uniqueIds) {
        const income = additionalIncomeTotals.get(departureId)
        overviewSourceFactsMap.set(departureId, {
          sourceReceivableUngeneratedCents: 0,
          generatedResourceAgreedCents: 0,
          additionalIncomeNetCents: income?.netCents ?? 0,
          collectionStats: { ...EMPTY_OVERVIEW_COLLECTION_STATS },
          bSupplement: { ...EMPTY_OVERVIEW_B_SUPPLEMENT },
        })
        collectionInputsByDeparture.set(departureId, [])
        sourceOrdersByDeparture.set(departureId, [])
      }
      for (const fact of sourceOrderPathFacts) {
        sourceOrdersByDeparture.get(fact.departureId)!.push(fact)
        const sourceFacts = overviewSourceFactsMap.get(fact.departureId)!
        const financeState = sourceOrderFinanceStates.get(fact.id)
        const states = financeState?.paths ?? []
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

      const today = getShanghaiTodayString()

      for (const departureId of uniqueIds) {
        const sourceFacts = overviewSourceFactsMap.get(departureId)!
        const rollup = segmentRollupMap.get(departureId)
        const orders = sourceOrdersByDeparture.get(departureId) ?? []
        const income = additionalIncomeTotals.get(departureId)
        const financeBundle = financeBundleMap.get(departureId)
        const financeRebateUnpaid = financeBundle?.snapshot.rebateUnpaidCents ?? 0
        const scheduleHints = financeBundle?.overviewScheduleHints

        const segmentInputs =
          rollup?.segments.map((segment) => {
            const payableGeneratedCount = segment.resources.filter(
              (resource) => resourceStates.get(resource.id)?.hasSchedule,
            ).length
            return {
              resourceCount: segment.resourceCount,
              payableGeneratedCount,
              outsourceCount: segment.outsourceCount,
              resourceAmountCents: segment.resourceAmountCents,
            }
          }) ?? []

        const departureResourceInputs =
          rollup?.resources
            .filter((resource) => resource.anchor === 'departure')
            .map((resource) => ({
              resourceKind: resource.resourceKind,
              amountCents: resource.amountCents,
              hasPaymentSchedule: resourceStates.get(resource.id)?.hasSchedule ?? false,
            })) ?? []

        const segmentResourceRows =
          rollup?.resources
            .filter((resource) => resource.anchor === 'segment')
            .map((resource) => ({
              resourceKind: resource.resourceKind,
              amountCents: resource.amountCents,
            })) ?? []

        sourceFacts.bSupplement = buildDepartureOverviewBSupplement({
          sourceOrders: orders.map((order) => {
            const financeState = sourceOrderFinanceStates.get(order.id)
            return {
              guestCount: order.guestCount,
              recordedGuestCount: order.recordedGuestCount,
              hasPaymentSchedule: financeState?.meta.hasSchedule ?? false,
              netReceivableCents: order.netReceivableCents,
            }
          }),
          segments: segmentInputs,
          departureResources: departureResourceInputs,
          income: {
            amountCentsTotal: income?.grossCents ?? 0,
            commissionCentsTotal: income?.expenseCents ?? 0,
          },
          rebateUnpaidCents: financeRebateUnpaid,
          segmentResourceRows:
            segmentResourceRows.length > 0 ? segmentResourceRows : undefined,
          today,
          overdueAccountCount: scheduleHints?.overdueAccountCount ?? 0,
          customerTopUpCents: scheduleHints?.customerTopUpCents ?? 0,
        })
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
        segments: [],
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
    return this.prisma.sourceOrder
      .findMany({
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
          guestCount: true,
          _count: { select: { guests: true } },
        },
      })
      .then((rows) =>
        rows.map((row) => ({
          id: row.id,
          departureId: row.departureId,
          collectionMode: row.collectionMode,
          depositCents: row.depositCents,
          balanceCents: row.balanceCents,
          netReceivableCents: row.netReceivableCents,
          partnerCollectedCents: row.partnerCollectedCents,
          guestCollectCents: row.guestCollectCents,
          guestCount: row.guestCount,
          recordedGuestCount: row._count.guests,
        })),
      )
  }

  /** 增收：gross=Σamount，expense=Σcommission，net=gross−expense */
  private async batchAdditionalIncomeTotals(
    organizationId: string,
    departureIds: string[],
  ): Promise<Map<string, AdditionalIncomeTotals>> {
    const rows = await this.prisma.departureIncomeRecord.groupBy({
      by: ['departureId'],
      where: {
        departureId: { in: departureIds },
        departure: { organizationId },
      },
      _sum: { amountCents: true, commissionCents: true },
    })
    return new Map(
      rows.map((row) => {
        const grossCents = row._sum.amountCents ?? 0
        const expenseCents = row._sum.commissionCents ?? 0
        return [
          row.departureId,
          {
            grossCents,
            expenseCents,
            netCents: grossCents - expenseCents,
          },
        ]
      }),
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
            select: { id: true, amountCents: true, resourceKind: true },
          },
        },
      }),
      this.prisma.departureResource.findMany({
        where: { departureId: { in: departureIds } },
        select: {
          id: true,
          departureId: true,
          amountCents: true,
          resourceKind: true,
        },
      }),
    ])

    const map = new Map<string, SegmentRollup>()
    for (const departureId of departureIds) {
      map.set(departureId, {
        segmentCount: 0,
        resourceCount: 0,
        payableCents: 0,
        segments: [],
        resources: [],
      })
    }

    for (const segment of segments) {
      const rollup = map.get(segment.departureId)!
      const segmentResources = segment.resources.map((resource) => ({
        id: resource.id,
        amountCents: resource.amountCents,
        resourceKind: resource.resourceKind,
      }))
      const resourceAmountCents = segmentResources.reduce(
        (sum, resource) => sum + resource.amountCents,
        0,
      )
      const outsourceCount = segmentResources.filter(
        (resource) => resource.resourceKind === ResourceKind.OUTSOURCE,
      ).length
      rollup.segmentCount += 1
      rollup.resourceCount += segmentResources.length
      rollup.payableCents += resourceAmountCents
      rollup.segments.push({
        id: segment.id,
        resourceCount: segmentResources.length,
        outsourceCount,
        resourceAmountCents,
        resources: segmentResources,
      })
      rollup.resources.push(
        ...segmentResources.map((resource) => ({
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
        resourceKind: resource.resourceKind,
        anchor: 'departure',
      })
    }

    return map
  }
}

export type { DepartureReadModelAggregate, DepartureCompletionTags }
