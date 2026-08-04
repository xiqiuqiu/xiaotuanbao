import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  BatchFinanceGenerationItem,
  BatchFinanceGenerationResult,
  GenerateReceivablesResult,
  PartnerSourceOrderListResult,
  SourceOrderFareAdjustmentSummary,
  SourceOrderGuestSummary,
  SourceOrderListResult,
  SourceOrderSummary,
} from '@xiaotuanbao/shared'
import {
  didSourceAmountPathChange,
  SegmentPayableStatus,
  SourceOrderReceivableStatus,
  type GuestCollectionChangeImpact,
} from '@xiaotuanbao/shared'
import {
  DirectoryProfileStatus,
  type Departure,
  type FareAdjustmentDirection,
  type FareAdjustmentKind,
  type Partner,
  type Prisma,
  type SourceOrder,
  type SourceOrderFareAdjustment,
  type SourceOrderGuest,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { DepartureFinanceFacade } from '../finance/departure-finance-facade.service'
import type {
  CreateSourceOrderDto,
  CreateSourceOrderGuestDto,
  ListPartnerSourceOrdersQueryDto,
  ListSourceOrdersQueryDto,
  UpdateSourceOrderDto,
  UpdateSourceOrderGuestDto,
} from './dto/source-order.dto'
import { formatDateOnly, parseDateOnly } from './departure-date.utils'
import {
  buildSourceOrderDisplayName,
  computeSourceOrderAmounts,
  resolveSourceOrderAmountChange,
  resolveSourceOrderCollectionPeriods,
  resolveUpdateCollectionPeriodInputs,
  toSourceOrderGuestNameSummaries,
  type SourceOrderFareAdjustmentInput,
} from './source-order.utils'
import { validateSourceOrderInput } from './source-order.validation'
import {
  httpExceptionMessage,
  isAlreadyGeneratedConflict,
  summarizeBatchFinanceGeneration,
} from './batch-finance-generation.utils'
import type { SourceOrderFinanceMeta } from '../finance/departure-finance-schedule-loaders'
import { TransactionService } from '../finance/transaction.service'

type SourceOrderFareAdjustmentRow = Pick<
  SourceOrderFareAdjustment,
  'id' | 'kind' | 'direction' | 'amountCents' | 'customName' | 'sortOrder'
>

type SourceOrderWithPartner = SourceOrder & {
  partner: Partner
  fareAdjustments?: SourceOrderFareAdjustmentRow[]
  guests?: Array<{ id: string; name: string }>
}

function toFareAdjustmentInputs(
  items: SourceOrderFareAdjustmentInput[] | SourceOrderFareAdjustment[] | undefined,
): SourceOrderFareAdjustmentInput[] {
  return (items ?? []).map((item) => ({
    kind: item.kind,
    direction: item.direction as 'increase' | 'decrease',
    amountCents: item.amountCents,
    customName: item.customName ?? null,
  }))
}

function toFareAdjustmentCreateRows(
  sourceOrderId: string,
  items: SourceOrderFareAdjustmentInput[],
) {
  return items.map((item, index) => ({
    sourceOrderId,
    kind: item.kind as FareAdjustmentKind,
    direction: item.direction as FareAdjustmentDirection,
    amountCents: item.amountCents,
    customName: item.customName?.trim() || null,
    sortOrder: index,
  }))
}

@Injectable()
export class SourceOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departureFinanceFacade: DepartureFinanceFacade,
    private readonly transactionService: TransactionService,
  ) {}

  async listByDeparture(
    organizationId: string,
    departureId: string,
    query: ListSourceOrdersQueryDto,
  ): Promise<SourceOrderListResult> {
    const departure = await this.findDepartureOrThrow(organizationId, departureId)
    const keyword = query.keyword?.trim()

    const where: Prisma.SourceOrderWhereInput = {
      departureId: departure.id,
      ...(query.partnerId ? { partnerId: query.partnerId } : {}),
      ...(query.collectionMode ? { collectionMode: query.collectionMode } : {}),
      ...(query.hasDiscount === 'yes'
        ? { discountCents: { gt: 0 } }
        : query.hasDiscount === 'no'
          ? { discountCents: 0 }
          : {}),
      ...(keyword
        ? {
            OR: [
              { displayName: { contains: keyword, mode: 'insensitive' } },
              { notes: { contains: keyword, mode: 'insensitive' } },
              { partner: { name: { contains: keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }

    const orders = await this.prisma.sourceOrder.findMany({
      where,
      include: {
        partner: true,
        fareAdjustments: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        guests: { orderBy: { createdAt: 'asc' }, select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'asc' }],
    })

    const scheduleMetaMap = await this.loadScheduleMeta(organizationId, orders.map((o) => o.id))
    const items = orders.map((order) =>
      this.toSourceOrderSummary(order, scheduleMetaMap.get(order.id)),
    )

    const partnerIds = new Set(items.map((item) => item.partnerId))

    return {
      items,
      total: items.length,
      summary: {
        orderCount: items.length,
        totalGuests: items.reduce((sum, item) => sum + item.guestCount, 0),
        partnerCount: partnerIds.size,
        totalGrossReceivableCents: items.reduce(
          (sum, item) => sum + item.grossReceivableCents,
          0,
        ),
        totalFareAdjustmentNetCents: items.reduce(
          (sum, item) => sum + item.fareAdjustmentNetCents,
          0,
        ),
        totalDiscountCents: items.reduce((sum, item) => sum + item.discountCents, 0),
        totalNetReceivableCents: items.reduce((sum, item) => sum + item.netReceivableCents, 0),
        totalGuestCollectCents: items.reduce((sum, item) => sum + item.guestCollectCents, 0),
      },
    }
  }

  /** 合作团单·客源分段：按 Partner 跨发团查询客源单，出团日期区间过滤＋倒序＋分页。 */
  async listByPartner(
    organizationId: string,
    partnerId: string,
    query: ListPartnerSourceOrdersQueryDto,
  ): Promise<PartnerSourceOrderListResult> {
    const partner = await this.prisma.partner.findFirst({
      where: { id: partnerId, organizationId },
    })
    if (!partner) {
      throw new NotFoundException('合作伙伴不存在')
    }

    if (
      query.departureDateFrom &&
      query.departureDateTo &&
      query.departureDateFrom > query.departureDateTo
    ) {
      throw new BadRequestException('出团日期区间非法')
    }

    const page = Math.max(Number(query.page) || 1, 1)
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 10, 1), 100)

    const where: Prisma.SourceOrderWhereInput = {
      partnerId: partner.id,
      departure: {
        organizationId,
        ...(query.departureDateFrom || query.departureDateTo
          ? {
              startDate: {
                ...(query.departureDateFrom
                  ? { gte: parseDateOnly(query.departureDateFrom) }
                  : {}),
                ...(query.departureDateTo
                  ? { lte: parseDateOnly(query.departureDateTo) }
                  : {}),
              },
            }
          : {}),
      },
    }

    const [orders, total, aggregate] = await Promise.all([
      this.prisma.sourceOrder.findMany({
        where,
        include: {
          departure: {
            select: { departureNo: true, name: true, routeName: true, startDate: true },
          },
        },
        orderBy: [{ departure: { startDate: 'desc' } }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.sourceOrder.count({ where }),
      this.prisma.sourceOrder.aggregate({
        where,
        _sum: {
          guestCount: true,
          grossReceivableCents: true,
          fareAdjustmentNetCents: true,
          discountCents: true,
          netReceivableCents: true,
          guestCollectCents: true,
        },
      }),
    ])

    return {
      items: orders.map((order) => ({
        id: order.id,
        departureId: order.departureId,
        departureNo: order.departure.departureNo,
        departureName: order.departure.name,
        routeName: order.departure.routeName,
        departureStartDate: formatDateOnly(order.departure.startDate),
        displayName: order.displayName,
        guestCount: order.guestCount,
        adultGuestCount: order.adultGuestCount,
        childGuestCount: order.childGuestCount,
        adultUnitPriceCents: order.adultUnitPriceCents,
        childUnitPriceCents: order.childUnitPriceCents,
        grossReceivableCents: order.grossReceivableCents,
        fareAdjustmentNetCents: order.fareAdjustmentNetCents,
        discountCents: order.discountCents,
        netReceivableCents: order.netReceivableCents,
        partnerCollectedCents: order.partnerCollectedCents,
        guestCollectCents: order.guestCollectCents,
        notes: order.notes,
      })),
      total,
      page,
      pageSize,
      summary: {
        orderCount: total,
        totalGuests: aggregate._sum.guestCount ?? 0,
        partnerCount: total > 0 ? 1 : 0,
        totalGrossReceivableCents: aggregate._sum.grossReceivableCents ?? 0,
        totalFareAdjustmentNetCents: aggregate._sum.fareAdjustmentNetCents ?? 0,
        totalDiscountCents: aggregate._sum.discountCents ?? 0,
        totalNetReceivableCents: aggregate._sum.netReceivableCents ?? 0,
        totalGuestCollectCents: aggregate._sum.guestCollectCents ?? 0,
      },
    }
  }

  async create(
    organizationId: string,
    departureId: string,
    dto: CreateSourceOrderDto,
  ): Promise<SourceOrderSummary> {
    const departure = await this.findDepartureOrThrow(organizationId, departureId)
    this.ensureDepartureEditable(departure)

    const partner = await this.ensureSelectablePartner(organizationId, dto.partnerId)
    const fareAdjustments = toFareAdjustmentInputs(dto.fareAdjustments)
    const normalized = this.normalizeInput({ ...dto, fareAdjustments })

    validateSourceOrderInput({
      partnerId: partner.id,
      ...normalized,
    })

    const amounts = computeSourceOrderAmounts(normalized)
    const guestCount = normalized.adultGuestCount + normalized.childGuestCount
    const displayName = await this.generateDisplayName(
      departure,
      partner.name,
      partner.id,
    )

    const created = await this.prisma.$transaction(async (tx) => {
      const order = await tx.sourceOrder.create({
        data: {
          departureId: departure.id,
          partnerId: partner.id,
          displayName,
          guestCount,
          adultGuestCount: normalized.adultGuestCount,
          childGuestCount: normalized.childGuestCount,
          adultUnitPriceCents: normalized.adultUnitPriceCents ?? 0,
          childUnitPriceCents: normalized.childUnitPriceCents ?? 0,
          grossReceivableCents: amounts.grossReceivableCents,
          fareAdjustmentNetCents: amounts.fareAdjustmentNetCents,
          discountType: normalized.discountType,
          discountCents: amounts.discountCents,
          discountNotes: dto.discountNotes?.trim() || null,
          netReceivableCents: amounts.netReceivableCents,
          collectionMode: normalized.collectionMode,
          depositCents: amounts.depositCents,
          balanceCents: amounts.balanceCents,
          partnerCollectedCents: amounts.partnerCollectedCents,
          guestCollectCents: amounts.guestCollectCents,
          settlementNotes: dto.settlementNotes?.trim() || null,
          notes: dto.notes?.trim() || null,
        },
      })

      if (fareAdjustments.length > 0) {
        await tx.sourceOrderFareAdjustment.createMany({
          data: toFareAdjustmentCreateRows(order.id, fareAdjustments),
        })
      }

      return tx.sourceOrder.findFirstOrThrow({
        where: { id: order.id },
        include: {
          partner: true,
          fareAdjustments: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
          guests: { orderBy: { createdAt: 'asc' }, select: { id: true, name: true } },
        },
      })
    })

    return this.toSourceOrderSummary(created, {
      hasSchedule: false,
      receivableStatus: SourceOrderReceivableStatus.NOT_GENERATED,
      hasSourceAmountMismatch: false,
      amountFieldsLocked: false,
      hasIncompleteReceivablePaths: false,
      rebateCents: 0,
      rebateStatus: SegmentPayableStatus.NOT_GENERATED,
      rebateScheduleNo: null,
    })
  }

  async generateReceivables(
    organizationId: string,
    sourceOrderId: string,
  ): Promise<GenerateReceivablesResult> {
    return this.departureFinanceFacade.generateReceivables(
      organizationId,
      sourceOrderId,
      (order, meta) => this.toSourceOrderSummary(order, meta),
    )
  }

  async settleByActualCollection(organizationId: string, sourceOrderId: string) {
    return this.departureFinanceFacade.settleByActualCollection(
      organizationId,
      sourceOrderId,
      (order, meta) => this.toSourceOrderSummary(order, meta),
    )
  }

  async generateReceivablesForDeparture(
    organizationId: string,
    departureId: string,
  ): Promise<BatchFinanceGenerationResult> {
    await this.departureFinanceFacade.assertAllowsNewObligationById(
      organizationId,
      departureId,
      '提交应收',
    )

    const orders = await this.prisma.sourceOrder.findMany({
      where: { departureId, departure: { organizationId } },
      include: { partner: true },
      orderBy: { createdAt: 'asc' },
    })

    const items: BatchFinanceGenerationItem[] = []

    for (const order of orders) {
      const sourceLabel = order.partner.name

      if (order.partnerCollectedCents <= 0 && order.guestCollectCents <= 0) {
        items.push({
          sourceId: order.id,
          sourceLabel,
          outcome: 'skipped',
          reason: '无可生成金额',
        })
        continue
      }

      try {
        // generateReceivables 会补建缺失约定路径；路径齐全时 409 → skipped。
        const generated = await this.generateReceivables(organizationId, order.id)
        items.push({
          sourceId: order.id,
          sourceLabel,
          outcome: 'succeeded',
          generatedCount: generated.schedules.length,
        })
      } catch (error) {
        if (isAlreadyGeneratedConflict(error)) {
          items.push({
            sourceId: order.id,
            sourceLabel,
            outcome: 'skipped',
            reason: httpExceptionMessage(error),
          })
          continue
        }
        items.push({
          sourceId: order.id,
          sourceLabel,
          outcome: 'failed',
          reason: httpExceptionMessage(error),
        })
      }
    }

    return summarizeBatchFinanceGeneration(items)
  }

  async getById(organizationId: string, sourceOrderId: string): Promise<SourceOrderSummary> {
    const order = await this.findSourceOrderOrThrow(organizationId, sourceOrderId)
    const scheduleMeta = await this.loadScheduleMeta(organizationId, [order.id])
    return this.toSourceOrderSummary(order, scheduleMeta.get(order.id))
  }

  async update(
    organizationId: string,
    sourceOrderId: string,
    dto: UpdateSourceOrderDto,
  ): Promise<SourceOrderSummary> {
    const order = await this.findSourceOrderOrThrow(organizationId, sourceOrderId)
    this.ensureDepartureEditable(order.departure)

    const partnerId = dto.partnerId ?? order.partnerId
    const partner =
      dto.partnerId !== undefined
        ? await this.ensureSelectablePartner(organizationId, partnerId)
        : order.partner

    const existingFareAdjustments = toFareAdjustmentInputs(order.fareAdjustments)
    const fareAdjustments =
      dto.fareAdjustments !== undefined
        ? toFareAdjustmentInputs(dto.fareAdjustments)
        : existingFareAdjustments
    const periodInputs = resolveUpdateCollectionPeriodInputs({
      dtoDepositCents: dto.depositCents,
      dtoBalanceCents: dto.balanceCents,
      dtoCollectionMode: dto.collectionMode,
      stored: {
        collectionMode: order.collectionMode,
        depositCents: order.depositCents,
        balanceCents: order.balanceCents,
        guestCollectCents: order.guestCollectCents,
        netReceivableCents: order.netReceivableCents,
      },
    })
    const normalized = this.normalizeInput({
      adultGuestCount: dto.adultGuestCount ?? order.adultGuestCount,
      childGuestCount: dto.childGuestCount ?? order.childGuestCount,
      adultUnitPriceCents:
        dto.adultUnitPriceCents !== undefined
          ? dto.adultUnitPriceCents
          : order.adultUnitPriceCents,
      childUnitPriceCents:
        dto.childUnitPriceCents !== undefined
          ? dto.childUnitPriceCents
          : order.childUnitPriceCents,
      discountType: dto.discountType ?? order.discountType,
      discountCents: dto.discountCents ?? order.discountCents,
      collectionMode: dto.collectionMode ?? order.collectionMode,
      depositCents: periodInputs.depositCents,
      balanceCents: periodInputs.balanceCents,
      fareAdjustments,
    })

    validateSourceOrderInput({
      partnerId: partner.id,
      ...normalized,
    })

    const recomputedAmounts = computeSourceOrderAmounts(normalized)
    const storedAmounts = {
      adultGuestCount: order.adultGuestCount,
      childGuestCount: order.childGuestCount,
      adultUnitPriceCents: order.adultUnitPriceCents,
      childUnitPriceCents: order.childUnitPriceCents,
      discountType: order.discountType,
      discountCents: order.discountCents,
      collectionMode: order.collectionMode,
      depositCents: order.depositCents,
      balanceCents: order.balanceCents,
      partnerCollectedCents: order.partnerCollectedCents,
      guestCollectCents: order.guestCollectCents,
      grossReceivableCents: order.grossReceivableCents,
      fareAdjustmentNetCents: order.fareAdjustmentNetCents,
      netReceivableCents: order.netReceivableCents,
      fareAdjustments: existingFareAdjustments,
    }
    const nextAmountInputs = {
      adultGuestCount: normalized.adultGuestCount,
      childGuestCount: normalized.childGuestCount,
      adultUnitPriceCents: normalized.adultUnitPriceCents ?? 0,
      childUnitPriceCents: normalized.childUnitPriceCents ?? 0,
      discountType: normalized.discountType,
      discountCents: normalized.discountCents,
      collectionMode: normalized.collectionMode,
      depositCents: normalized.depositCents,
      balanceCents: normalized.balanceCents,
      fareAdjustments: normalized.fareAdjustments,
    }
    const { amountInputsChanged } = resolveSourceOrderAmountChange(
      storedAmounts,
      nextAmountInputs,
    )
    // When amount inputs are unchanged, keep stored path amounts — receivable path sync
    // may have updated gross/net/guestCollect without rewriting unit prices.
    const amounts = amountInputsChanged
      ? recomputedAmounts
      : {
          grossReceivableCents: order.grossReceivableCents,
          fareAdjustmentNetCents: order.fareAdjustmentNetCents,
          discountCents: order.discountCents,
          netReceivableCents: order.netReceivableCents,
          depositCents: order.depositCents,
          balanceCents: order.balanceCents,
          partnerCollectedCents: order.partnerCollectedCents,
          guestCollectCents: order.guestCollectCents,
        }
    const guestCount = normalized.adultGuestCount + normalized.childGuestCount
    const pathAmountChanged = didSourceAmountPathChange(
      {
        guestCollectCents: order.guestCollectCents,
        partnerCollectedCents: order.partnerCollectedCents,
        depositCents: order.depositCents,
        balanceCents: order.balanceCents,
      },
      {
        guestCollectCents: amounts.guestCollectCents,
        partnerCollectedCents: amounts.partnerCollectedCents,
        depositCents: amounts.depositCents,
        balanceCents: amounts.balanceCents,
      },
    )

    await this.departureFinanceFacade.assertAmountFieldsEditable(
      organizationId,
      order.id,
      storedAmounts,
      nextAmountInputs,
    )

    const displayName =
      dto.partnerId !== undefined
        ? await this.generateDisplayName(order.departure, partner.name, partner.id, order.id)
        : order.displayName

    const changeAt = new Date()
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.sourceOrder.update({
        where: { id: order.id },
        data: {
          partnerId: partner.id,
          displayName,
          guestCount,
          adultGuestCount: normalized.adultGuestCount,
          childGuestCount: normalized.childGuestCount,
          adultUnitPriceCents: normalized.adultUnitPriceCents ?? 0,
          childUnitPriceCents: normalized.childUnitPriceCents ?? 0,
          grossReceivableCents: amounts.grossReceivableCents,
          fareAdjustmentNetCents: amounts.fareAdjustmentNetCents,
          discountType: normalized.discountType,
          discountCents: amounts.discountCents,
          discountNotes:
            dto.discountNotes !== undefined ? dto.discountNotes?.trim() || null : undefined,
          netReceivableCents: amounts.netReceivableCents,
          collectionMode: normalized.collectionMode,
          depositCents: amounts.depositCents,
          balanceCents: amounts.balanceCents,
          partnerCollectedCents: amounts.partnerCollectedCents,
          guestCollectCents: amounts.guestCollectCents,
          settlementNotes:
            dto.settlementNotes !== undefined ? dto.settlementNotes?.trim() || null : undefined,
          notes: dto.notes !== undefined ? dto.notes?.trim() || null : undefined,
        },
      })

      if (dto.fareAdjustments !== undefined) {
        await tx.sourceOrderFareAdjustment.deleteMany({ where: { sourceOrderId: order.id } })
        if (fareAdjustments.length > 0) {
          await tx.sourceOrderFareAdjustment.createMany({
            data: toFareAdjustmentCreateRows(order.id, fareAdjustments),
          })
        }
      }

      if (pathAmountChanged) {
        await this.transactionService.markGuestCollectionSourceAmountChanged(
          organizationId,
          order.id,
          changeAt,
          tx,
        )
      }

      return tx.sourceOrder.findFirstOrThrow({
        where: { id: order.id },
        include: {
          partner: true,
          departure: true,
          fareAdjustments: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
          guests: { orderBy: { createdAt: 'asc' }, select: { id: true, name: true } },
        },
      })
    })

    const financeMeta = await this.departureFinanceFacade.syncSourceOrderSchedules(
      organizationId,
      updated,
    )
    return this.toSourceOrderSummary(updated, financeMeta)
  }

  async getGuestCollectionChangeImpact(
    organizationId: string,
    sourceOrderId: string,
  ): Promise<GuestCollectionChangeImpact> {
    await this.findSourceOrderOrThrow(organizationId, sourceOrderId)
    const affectedTransactionCount =
      await this.transactionService.countGuestCollectionChangeImpact(
        organizationId,
        sourceOrderId,
      )
    return { affectedTransactionCount }
  }

  async remove(organizationId: string, sourceOrderId: string): Promise<void> {
    const order = await this.findSourceOrderOrThrow(organizationId, sourceOrderId)
    this.ensureDepartureEditable(order.departure)

    const presence = await this.departureFinanceFacade.getSourceOrderFinancePresence(
      organizationId,
      order.id,
    )
    if (presence.blocksRemoval) {
      throw new ConflictException('当前客源单已提交应收，不能直接删除')
    }

    await this.prisma.sourceOrder.delete({ where: { id: order.id } })
  }

  async listGuests(
    organizationId: string,
    sourceOrderId: string,
  ): Promise<SourceOrderGuestSummary[]> {
    const order = await this.findSourceOrderOrThrow(organizationId, sourceOrderId)
    const guests = await this.prisma.sourceOrderGuest.findMany({
      where: { sourceOrderId: order.id },
      orderBy: [{ createdAt: 'asc' }],
    })
    return guests.map((guest) => this.toGuestSummary(guest))
  }

  async createGuest(
    organizationId: string,
    sourceOrderId: string,
    dto: CreateSourceOrderGuestDto,
  ): Promise<SourceOrderGuestSummary> {
    const order = await this.findSourceOrderOrThrow(organizationId, sourceOrderId)
    this.ensureDepartureEditable(order.departure)

    const name = dto.name.trim()
    if (!name) {
      throw new BadRequestException('姓名不能为空')
    }

    const guest = await this.prisma.sourceOrderGuest.create({
      data: {
        sourceOrderId: order.id,
        name,
        phone: dto.phone?.trim() || null,
        gender: dto.gender ?? 'unknown',
        notes: dto.notes?.trim() || null,
      },
    })

    return this.toGuestSummary(guest)
  }

  async updateGuest(
    organizationId: string,
    sourceOrderId: string,
    guestId: string,
    dto: UpdateSourceOrderGuestDto,
  ): Promise<SourceOrderGuestSummary> {
    const order = await this.findSourceOrderOrThrow(organizationId, sourceOrderId)
    this.ensureDepartureEditable(order.departure)
    const guest = await this.findGuestOrThrow(order.id, guestId)

    const name = dto.name !== undefined ? dto.name.trim() : guest.name
    if (!name) {
      throw new BadRequestException('姓名不能为空')
    }

    const updated = await this.prisma.sourceOrderGuest.update({
      where: { id: guest.id },
      data: {
        name,
        phone: dto.phone !== undefined ? dto.phone?.trim() || null : undefined,
        gender: dto.gender ?? undefined,
        notes: dto.notes !== undefined ? dto.notes?.trim() || null : undefined,
      },
    })

    return this.toGuestSummary(updated)
  }

  async removeGuest(
    organizationId: string,
    sourceOrderId: string,
    guestId: string,
  ): Promise<void> {
    const order = await this.findSourceOrderOrThrow(organizationId, sourceOrderId)
    this.ensureDepartureEditable(order.departure)
    const guest = await this.findGuestOrThrow(order.id, guestId)
    await this.prisma.sourceOrderGuest.delete({ where: { id: guest.id } })
  }

  private normalizeInput(dto: {
    adultGuestCount: number
    childGuestCount: number
    adultUnitPriceCents?: number | null
    childUnitPriceCents?: number | null
    discountType: CreateSourceOrderDto['discountType']
    discountCents?: number
    collectionMode: CreateSourceOrderDto['collectionMode']
    depositCents?: number
    balanceCents?: number
    fareAdjustments?: SourceOrderFareAdjustmentInput[]
  }) {
    const discountType = dto.discountType
    const discountCents =
      discountType === 'lump_sum' ? Math.max(dto.discountCents ?? 0, 0) : 0
    const collectionMode = dto.collectionMode
    const adultUnitPriceCents =
      dto.adultGuestCount === 0 ? (dto.adultUnitPriceCents ?? 0) : dto.adultUnitPriceCents
    const childUnitPriceCents =
      dto.childGuestCount === 0 ? (dto.childUnitPriceCents ?? 0) : dto.childUnitPriceCents
    const fareAdjustments = toFareAdjustmentInputs(dto.fareAdjustments)
    const { depositCents, balanceCents } = resolveSourceOrderCollectionPeriods({
      collectionMode,
      depositCents: dto.depositCents,
      balanceCents: dto.balanceCents,
      adultGuestCount: dto.adultGuestCount,
      childGuestCount: dto.childGuestCount,
      adultUnitPriceCents,
      childUnitPriceCents,
      discountType,
      discountCents,
      fareAdjustments,
    })

    return {
      adultGuestCount: dto.adultGuestCount,
      childGuestCount: dto.childGuestCount,
      adultUnitPriceCents,
      childUnitPriceCents,
      discountType,
      discountCents,
      collectionMode,
      depositCents,
      balanceCents,
      fareAdjustments,
    }
  }

  private async generateDisplayName(
    departure: Departure,
    partnerName: string,
    partnerId: string,
    excludeId?: string,
  ): Promise<string> {
    const existingCount = await this.prisma.sourceOrder.count({
      where: {
        departureId: departure.id,
        partnerId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    })

    return buildSourceOrderDisplayName(partnerName, existingCount + 1)
  }

  private async loadScheduleMeta(organizationId: string, sourceOrderIds: string[]) {
    const states = await this.departureFinanceFacade.getSourceOrderFinanceStates(
      organizationId,
      sourceOrderIds,
    )
    const map = new Map<string, SourceOrderFinanceMeta>()
    for (const [sourceOrderId, state] of states) {
      map.set(sourceOrderId, state.meta)
    }
    return map
  }

  private async findDepartureOrThrow(organizationId: string, departureId: string) {
    const departure = await this.prisma.departure.findFirst({
      where: { id: departureId, organizationId },
    })

    if (!departure) {
      throw new NotFoundException('发团不存在')
    }

    return departure
  }

  private async findSourceOrderOrThrow(organizationId: string, sourceOrderId: string) {
    const order = await this.prisma.sourceOrder.findFirst({
      where: {
        id: sourceOrderId,
        departure: { organizationId },
      },
      include: {
        partner: true,
        departure: true,
        fareAdjustments: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        guests: { orderBy: { createdAt: 'asc' }, select: { id: true, name: true } },
      },
    })

    if (!order) {
      throw new NotFoundException('客源单不存在')
    }

    return order
  }

  private async findGuestOrThrow(sourceOrderId: string, guestId: string) {
    const guest = await this.prisma.sourceOrderGuest.findFirst({
      where: { id: guestId, sourceOrderId },
    })

    if (!guest) {
      throw new NotFoundException('客人不存在')
    }

    return guest
  }

  private async ensureSelectablePartner(organizationId: string, partnerId: string) {
    const partner = await this.prisma.partner.findFirst({
      where: { id: partnerId, organizationId },
    })

    if (!partner) {
      throw new BadRequestException('客户不存在')
    }

    if (partner.status !== DirectoryProfileStatus.active) {
      throw new BadRequestException('客户不可用，请选择有效客户')
    }

    return partner
  }

  private ensureDepartureEditable(departure: Departure) {
    this.departureFinanceFacade.assertMutable(departure, '编辑')
  }

  private toSourceOrderSummary(
    order: SourceOrderWithPartner,
    scheduleMeta?: SourceOrderFinanceMeta,
  ): SourceOrderSummary {
    const fareAdjustments: SourceOrderFareAdjustmentSummary[] = (
      order.fareAdjustments ?? []
    ).map((item) => ({
      id: item.id,
      kind: item.kind,
      direction: item.direction,
      amountCents: item.amountCents,
      customName: item.customName,
      sortOrder: item.sortOrder,
    }))

    return {
      id: order.id,
      departureId: order.departureId,
      partnerId: order.partnerId,
      partnerName: order.partner.name,
      displayName: order.displayName,
      guestCount: order.guestCount,
      adultGuestCount: order.adultGuestCount,
      childGuestCount: order.childGuestCount,
      adultUnitPriceCents: order.adultUnitPriceCents,
      childUnitPriceCents: order.childUnitPriceCents,
      grossReceivableCents: order.grossReceivableCents,
      fareAdjustmentNetCents: order.fareAdjustmentNetCents,
      fareAdjustments,
      discountType: order.discountType,
      discountCents: order.discountCents,
      discountNotes: order.discountNotes,
      netReceivableCents: order.netReceivableCents,
      collectionMode: order.collectionMode,
      depositCents: order.depositCents,
      balanceCents: order.balanceCents,
      partnerCollectedCents: order.partnerCollectedCents,
      guestCollectCents: order.guestCollectCents,
      settlementNotes: order.settlementNotes,
      notes: order.notes,
      guests: toSourceOrderGuestNameSummaries(order.guests),
      receivableStatus:
        scheduleMeta?.receivableStatus ?? SourceOrderReceivableStatus.NOT_GENERATED,
      hasPaymentSchedule: scheduleMeta?.hasSchedule ?? false,
      hasSourceAmountMismatch: scheduleMeta?.hasSourceAmountMismatch ?? false,
      amountFieldsLocked: scheduleMeta?.amountFieldsLocked ?? false,
      hasIncompleteReceivablePaths: scheduleMeta?.hasIncompleteReceivablePaths ?? false,
      estimatedRebateCents: Math.max(0, order.guestCollectCents - order.netReceivableCents),
      rebateCents: scheduleMeta?.rebateCents ?? 0,
      rebateStatus: scheduleMeta?.rebateStatus ?? SegmentPayableStatus.NOT_GENERATED,
      rebateScheduleNo: scheduleMeta?.rebateScheduleNo ?? null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    }
  }

  private toGuestSummary(guest: SourceOrderGuest): SourceOrderGuestSummary {
    return {
      id: guest.id,
      sourceOrderId: guest.sourceOrderId,
      name: guest.name,
      phone: guest.phone,
      gender: guest.gender,
      notes: guest.notes,
      createdAt: guest.createdAt.toISOString(),
      updatedAt: guest.updatedAt.toISOString(),
    }
  }
}
