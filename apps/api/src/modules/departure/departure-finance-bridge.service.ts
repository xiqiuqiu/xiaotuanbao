import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  GenerateReceivablesResult,
  PaymentScheduleSummary,
  SourceOrderSummary,
} from '@xiaotuanbao/shared'
import {
  isFinanceTouched,
  PaymentScheduleSourceType,
  SourceOrderReceivableStatus,
  deriveScheduleState,
  computeReceivableDueDate,
  PaymentScheduleStatus,
  ResourceKind,
} from '@xiaotuanbao/shared'
import {
  CounterpartyType,
  PaymentScheduleDirection,
  type Partner,
  type PaymentSchedule,
  type Prisma,
  type SegmentResource,
  type SourceOrder,
  type Supplier,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import {
  DepartureFinanceFacade,
  type SegmentResourceFinanceState,
} from '../finance/departure-finance-facade.service'
import { PaymentScheduleService } from '../finance/payment-schedule.service'
import { VerificationService } from '../finance/verification.service'
import { formatDateOnly, getShanghaiTodayString } from './departure-date.utils'
import { buildSourceOrderReceivablePaths } from './source-order-receivable-paths'

/** @deprecated Prefer SegmentResourceFinanceState from DepartureFinanceFacade (#49). */
export type SegmentResourceFinanceMeta = SegmentResourceFinanceState

type SourceOrderWithRelations = SourceOrder & {
  partner: Partner
  departure: {
    id: string
    organizationId: string
    status: string
    startDate: Date
    endDate: Date
  }
}

export interface SourceOrderFinanceMeta {
  hasSchedule: boolean
  receivableStatus: SourceOrderReceivableStatus
  hasSourceAmountMismatch: boolean
  amountFieldsLocked: boolean
}

type SegmentResourceWithRelations = SegmentResource & {
  partner: Partner | null
  supplier: Supplier | null
  segment: {
    id: string
    endDate: Date | null
    departure: { id: string; organizationId: string; status: string; endDate: Date }
  }
}

type DbClient = PrismaService | Prisma.TransactionClient

interface PayableSpec {
  amountCents: number
  title: string
  counterpartyType: CounterpartyType
  counterpartyId?: string
  counterpartyName?: string
}

@Injectable()
export class DepartureFinanceBridgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentScheduleService: PaymentScheduleService,
    private readonly verificationService: VerificationService,
    private readonly departureFinanceFacade: DepartureFinanceFacade,
  ) {}

  async generateReceivables(
    organizationId: string,
    sourceOrderId: string,
    toSourceOrderSummary: (
      order: SourceOrder & { partner: Partner },
      meta: SourceOrderFinanceMeta,
    ) => SourceOrderSummary,
  ): Promise<GenerateReceivablesResult> {
    const { order, schedules } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM source_orders
        WHERE id = ${sourceOrderId}
        FOR UPDATE
      `

      const lockedOrder = await this.loadSourceOrderOrThrow(
        organizationId,
        sourceOrderId,
        tx,
      )
      this.ensureDepartureAllowsNewObligation(lockedOrder.departure)

      const existingSchedules = await this.loadReceivableSchedules(
        organizationId,
        sourceOrderId,
        tx,
      )
      if (existingSchedules.length > 0) {
        throw new ConflictException('当前客源单已生成应收，不能再次生成')
      }

      const createdSchedules: PaymentScheduleSummary[] = []
      const dueDate = computeReceivableDueDate(formatDateOnly(lockedOrder.departure.startDate))

      for (const path of this.buildReceivablePaths(lockedOrder)) {
        if (path.amountCents <= 0) {
          continue
        }

        const created = await this.paymentScheduleService.create(
          organizationId,
          PaymentScheduleDirection.receivable,
          {
            departureId: lockedOrder.departureId,
            title: path.title,
            amountCents: path.amountCents,
            dueDate,
            counterpartyType: path.counterpartyType,
            counterpartyId: path.counterpartyId,
            counterpartyName: path.counterpartyName,
            sourceType: path.sourceType,
            sourceId: sourceOrderId,
          },
          tx,
        )
        createdSchedules.push(created)
      }

      return { order: lockedOrder, schedules: createdSchedules }
    })

    const financeMeta = await this.evaluateFinanceMeta(organizationId, sourceOrderId, order)

    return {
      schedules,
      sourceOrder: toSourceOrderSummary(order, financeMeta),
      sourceAmountMismatch: financeMeta.hasSourceAmountMismatch,
    }
  }

  async syncSourceOrderSchedules(
    organizationId: string,
    order: SourceOrderWithRelations,
  ): Promise<SourceOrderFinanceMeta> {
    const allSchedules = await this.loadReceivableSchedules(organizationId, order.id)
    if (allSchedules.length === 0) {
      return this.evaluateFinanceMeta(organizationId, order.id, order)
    }

    const activeSchedules = allSchedules.filter((schedule) => schedule.cancelledAt == null)
    let anyTouched = false

    for (const schedule of activeSchedules) {
      const expectedAmount = this.getExpectedAmountForSchedule(schedule.sourceType, order)
      const [settledAmountCents, hasVerificationHistory] = await Promise.all([
        this.verificationService.getSettledAmountCents(schedule.id),
        this.verificationService.hasVerificationHistory(schedule.id),
      ])
      const touched = isFinanceTouched(schedule, settledAmountCents, hasVerificationHistory)
      if (touched) {
        anyTouched = true
      }

      if (touched || expectedAmount <= 0 || schedule.amountCents === expectedAmount) {
        continue
      }

      await this.paymentScheduleService.update(
        organizationId,
        PaymentScheduleDirection.receivable,
        schedule.id,
        { amountCents: expectedAmount },
      )
    }

    if (activeSchedules.length > 0 && !anyTouched) {
      const existingActiveSourceTypes = new Set(
        activeSchedules.map((schedule) => schedule.sourceType),
      )
      const dueDate = computeReceivableDueDate(formatDateOnly(order.departure.startDate))

      for (const path of this.buildReceivablePaths(order)) {
        if (path.amountCents <= 0 || existingActiveSourceTypes.has(path.sourceType)) {
          continue
        }

        await this.paymentScheduleService.create(
          organizationId,
          PaymentScheduleDirection.receivable,
          {
            departureId: order.departureId,
            title: path.title,
            amountCents: path.amountCents,
            dueDate,
            counterpartyType: path.counterpartyType,
            counterpartyId: path.counterpartyId,
            counterpartyName: path.counterpartyName,
            sourceType: path.sourceType,
            sourceId: order.id,
          },
        )
        existingActiveSourceTypes.add(path.sourceType)
      }
    }

    return this.evaluateFinanceMeta(organizationId, order.id, order)
  }

  async evaluateFinanceMeta(
    organizationId: string,
    sourceOrderId: string,
    order?: Pick<SourceOrder, 'partnerCollectedCents' | 'guestCollectCents'>,
  ): Promise<SourceOrderFinanceMeta> {
    const amounts =
      order ??
      (await this.prisma.sourceOrder.findFirstOrThrow({
        where: { id: sourceOrderId },
        select: { partnerCollectedCents: true, guestCollectCents: true },
      }))

    const schedules = await this.loadReceivableSchedules(organizationId, sourceOrderId)
    if (schedules.length === 0) {
      return {
        hasSchedule: false,
        receivableStatus: SourceOrderReceivableStatus.NOT_GENERATED,
        hasSourceAmountMismatch: false,
        amountFieldsLocked: false,
      }
    }

    const activeSchedules = schedules.filter((schedule) => schedule.cancelledAt == null)
    if (activeSchedules.length === 0) {
      return {
        hasSchedule: true,
        receivableStatus: SourceOrderReceivableStatus.CLOSED,
        hasSourceAmountMismatch: false,
        amountFieldsLocked: true,
      }
    }

    const settledMap = await this.verificationService.batchGetSettledAmounts(
      activeSchedules.map((schedule) => schedule.id),
    )
    const historyMap = await this.verificationService.batchHasVerificationHistory(
      activeSchedules.map((schedule) => schedule.id),
    )

    let hasSourceAmountMismatch = false
    let amountFieldsLocked = false
    const scheduleStates = activeSchedules.map((schedule) => {
      const settledAmountCents = settledMap.get(schedule.id) ?? 0
      const touched = isFinanceTouched(
        schedule,
        settledAmountCents,
        historyMap.get(schedule.id) ?? false,
      )
      if (touched) {
        amountFieldsLocked = true
        const expectedAmount = this.getExpectedAmountForSchedule(schedule.sourceType, amounts)
        if (expectedAmount > 0 && schedule.amountCents !== expectedAmount) {
          hasSourceAmountMismatch = true
        }
      }

      return {
        amountCents: schedule.amountCents,
        settledAmountCents,
        status: deriveScheduleState({
          amountCents: schedule.amountCents,
          settledAmountCents,
          dueDate: formatDateOnly(schedule.dueDate),
          cancelledAt: schedule.cancelledAt,
          businessDate: getShanghaiTodayString(),
          direction: schedule.direction,
        }),
      }
    })

    let receivableStatus = SourceOrderReceivableStatus.PENDING
    const allCollected = scheduleStates.every(
      (item) => item.status === PaymentScheduleStatus.SETTLED,
    )
    const anyPartial = scheduleStates.some(
      (item) =>
        item.settledAmountCents > 0 && item.settledAmountCents < item.amountCents,
    )

    if (allCollected) {
      receivableStatus = SourceOrderReceivableStatus.COLLECTED
      amountFieldsLocked = true
    } else if (anyPartial) {
      receivableStatus = SourceOrderReceivableStatus.PARTIAL
    }

    return {
      hasSchedule: true,
      receivableStatus,
      hasSourceAmountMismatch,
      amountFieldsLocked,
    }
  }

  async assertAmountFieldsEditable(
    organizationId: string,
    sourceOrderId: string,
    order: Pick<
      SourceOrder,
      | 'adultGuestCount'
      | 'childGuestCount'
      | 'adultUnitPriceCents'
      | 'childUnitPriceCents'
      | 'discountType'
      | 'discountCents'
      | 'collectionMode'
      | 'partnerCollectedCents'
    >,
    nextAmounts: Pick<
      SourceOrder,
      | 'adultGuestCount'
      | 'childGuestCount'
      | 'adultUnitPriceCents'
      | 'childUnitPriceCents'
      | 'discountType'
      | 'discountCents'
      | 'collectionMode'
      | 'partnerCollectedCents'
    >,
  ): Promise<void> {
    const amountChanged =
      order.adultGuestCount !== nextAmounts.adultGuestCount ||
      order.childGuestCount !== nextAmounts.childGuestCount ||
      order.adultUnitPriceCents !== nextAmounts.adultUnitPriceCents ||
      order.childUnitPriceCents !== nextAmounts.childUnitPriceCents ||
      order.discountType !== nextAmounts.discountType ||
      order.discountCents !== nextAmounts.discountCents ||
      order.collectionMode !== nextAmounts.collectionMode ||
      order.partnerCollectedCents !== nextAmounts.partnerCollectedCents

    if (!amountChanged) {
      return
    }

    const meta = await this.evaluateFinanceMeta(organizationId, sourceOrderId)
    if (meta.amountFieldsLocked) {
      throw new BadRequestException('当前客源单已发生收款，不允许修改金额')
    }
  }

  async generatePayable(
    organizationId: string,
    resourceId: string,
  ): Promise<{
    schedule: PaymentScheduleSummary
    sourceAmountMismatch: boolean
  }> {
    const { resource, schedule } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM segment_resources
        WHERE id = ${resourceId}
        FOR UPDATE
      `

      const lockedResource = await this.loadSegmentResourceOrThrow(
        organizationId,
        resourceId,
        tx,
      )
      this.ensureDepartureAllowsNewObligation(lockedResource.segment.departure, '生成应付')

      if (lockedResource.amountCents <= 0) {
        throw new BadRequestException('资源金额须大于 0 才能生成应付')
      }

      const existingTrace = await this.findAnyPayableSchedule(
        organizationId,
        resourceId,
        tx,
      )
      if (existingTrace) {
        throw new ConflictException('当前资源已生成应付，不能再次生成')
      }

      const spec = this.buildPayableSpec(lockedResource)
      const dueDate = formatDateOnly(lockedResource.segment.departure.endDate)
      const createdSchedule = await this.paymentScheduleService.create(
        organizationId,
        PaymentScheduleDirection.payable,
        {
          departureId: lockedResource.segment.departure.id,
          title: spec.title,
          amountCents: spec.amountCents,
          dueDate,
          counterpartyType: spec.counterpartyType,
          counterpartyId: spec.counterpartyId,
          counterpartyName: spec.counterpartyName,
          sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
          sourceId: resourceId,
        },
        tx,
      )

      return { resource: lockedResource, schedule: createdSchedule }
    })

    const financeMeta = await this.evaluateResourceFinanceMeta(
      organizationId,
      resourceId,
      resource,
    )

    return {
      schedule,
      sourceAmountMismatch: financeMeta.hasSourceAmountMismatch,
    }
  }

  async syncSegmentResourceSchedule(
    organizationId: string,
    resource: SegmentResourceWithRelations,
  ): Promise<SegmentResourceFinanceMeta> {
    const schedule = await this.findActivePayableSchedule(organizationId, resource.id)
    if (!schedule) {
      return this.evaluateResourceFinanceMeta(organizationId, resource.id, resource)
    }

    const spec = this.buildPayableSpec(resource)
    const [settledAmountCents, hasVerificationHistory] = await Promise.all([
      this.verificationService.getSettledAmountCents(schedule.id),
      this.verificationService.hasVerificationHistory(schedule.id),
    ])
    const touched = isFinanceTouched(schedule, settledAmountCents, hasVerificationHistory)

    if (!touched) {
      const updates: {
        amountCents?: number
        counterpartyType?: CounterpartyType
        counterpartyId?: string
        counterpartyName?: string | null
      } = {}

      if (schedule.amountCents !== spec.amountCents) {
        updates.amountCents = spec.amountCents
      }
      if (schedule.counterpartyType !== spec.counterpartyType) {
        updates.counterpartyType = spec.counterpartyType
      }
      if (schedule.counterpartyId !== (spec.counterpartyId ?? null)) {
        updates.counterpartyId = spec.counterpartyId
        updates.counterpartyName = spec.counterpartyName ?? null
      }

      if (Object.keys(updates).length > 0) {
        await this.paymentScheduleService.update(
          organizationId,
          PaymentScheduleDirection.payable,
          schedule.id,
          updates,
        )
      }
    }

    return this.evaluateResourceFinanceMeta(organizationId, resource.id, resource)
  }

  async evaluateResourceFinanceMeta(
    organizationId: string,
    resourceId: string,
    resource?: Pick<SegmentResource, 'amountCents' | 'resourceKind' | 'partnerId' | 'supplierId'>,
  ): Promise<SegmentResourceFinanceMeta> {
    return this.departureFinanceFacade.getSegmentResourceFinanceState(
      organizationId,
      resourceId,
      resource,
    )
  }

  async assertResourceAmountEditable(
    organizationId: string,
    resourceId: string,
    currentAmountCents: number,
    nextAmountCents: number,
  ): Promise<void> {
    if (currentAmountCents === nextAmountCents) {
      return
    }

    const meta = await this.evaluateResourceFinanceMeta(organizationId, resourceId)
    if (meta.amountFieldsLocked) {
      throw new BadRequestException('当前资源已发生付款，不允许修改金额')
    }
  }

  private buildPayableSpec(resource: SegmentResourceWithRelations): PayableSpec {
    const counterpartyName =
      resource.resourceKind === ResourceKind.OUTSOURCE
        ? resource.partner?.name
        : resource.supplier?.name

    const title =
      resource.title.trim() ||
      `${this.resourceKindLabel(resource.resourceKind)}·${counterpartyName ?? '未命名'}`

    if (resource.resourceKind === ResourceKind.OUTSOURCE) {
      return {
        amountCents: resource.amountCents,
        title,
        counterpartyType: CounterpartyType.partner,
        counterpartyId: resource.partnerId ?? undefined,
        counterpartyName: resource.partner?.name,
      }
    }

    return {
      amountCents: resource.amountCents,
      title,
      counterpartyType: CounterpartyType.supplier,
      counterpartyId: resource.supplierId ?? undefined,
      counterpartyName: resource.supplier?.name,
    }
  }

  private resourceKindLabel(resourceKind: string): string {
    const labels: Record<string, string> = {
      transport: '用车',
      hotel: '酒店',
      guide: '导游',
      ticket: '门票',
      meal: '餐',
      outsource: '拼出',
      other: '其他',
    }
    return labels[resourceKind] ?? resourceKind
  }

  private async findActivePayableSchedule(
    organizationId: string,
    resourceId: string,
  ): Promise<PaymentSchedule | null> {
    return this.prisma.paymentSchedule.findFirst({
      where: {
        organizationId,
        sourceId: resourceId,
        sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
        direction: PaymentScheduleDirection.payable,
        cancelledAt: null,
        voidedAt: null,
      },
    })
  }

  private async findAnyPayableSchedule(
    organizationId: string,
    resourceId: string,
    client: DbClient = this.prisma,
  ): Promise<PaymentSchedule | null> {
    return client.paymentSchedule.findFirst({
      where: {
        organizationId,
        sourceId: resourceId,
        sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
        direction: PaymentScheduleDirection.payable,
        voidedAt: null,
      },
    })
  }

  private async loadSegmentResourceOrThrow(
    organizationId: string,
    resourceId: string,
    client: DbClient = this.prisma,
  ): Promise<SegmentResourceWithRelations> {
    const resource = await client.segmentResource.findFirst({
      where: {
        id: resourceId,
        segment: { departure: { organizationId } },
      },
      include: {
        partner: true,
        supplier: true,
        segment: {
          select: {
            id: true,
            endDate: true,
            departure: {
              select: {
                id: true,
                organizationId: true,
                status: true,
                endDate: true,
              },
            },
          },
        },
      },
    })

    if (!resource) {
      throw new NotFoundException('段内资源不存在')
    }

    return resource
  }

  private buildReceivablePaths(order: SourceOrderWithRelations) {
    return buildSourceOrderReceivablePaths({
      sourceOrderId: order.id,
      partnerId: order.partnerId,
      partnerName: order.partner.name,
      displayName: order.displayName,
      partnerCollectedCents: order.partnerCollectedCents,
      guestCollectCents: order.guestCollectCents,
    })
  }

  private getExpectedAmountForSchedule(
    sourceType: string,
    order: Pick<SourceOrder, 'partnerCollectedCents' | 'guestCollectCents'>,
  ): number {
    if (sourceType === PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT) {
      return order.partnerCollectedCents
    }
    if (sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION) {
      return order.guestCollectCents
    }
    return 0
  }

  private async loadReceivableSchedules(
    organizationId: string,
    sourceOrderId: string,
    client: DbClient = this.prisma,
  ): Promise<PaymentSchedule[]> {
    return client.paymentSchedule.findMany({
      where: {
        organizationId,
        sourceId: sourceOrderId,
        direction: PaymentScheduleDirection.receivable,
      },
    })
  }

  private async loadSourceOrderOrThrow(
    organizationId: string,
    sourceOrderId: string,
    client: DbClient = this.prisma,
  ): Promise<SourceOrderWithRelations> {
    const order = await client.sourceOrder.findFirst({
      where: {
        id: sourceOrderId,
        departure: { organizationId },
      },
      include: {
        partner: true,
        departure: {
          select: {
            id: true,
            organizationId: true,
            status: true,
            startDate: true,
            endDate: true,
          },
        },
      },
    })

    if (!order) {
      throw new NotFoundException('客源单不存在')
    }

    return order
  }

  private ensureDepartureAllowsNewObligation(
    departure: { status: string },
    action = '生成应收',
  ) {
    this.departureFinanceFacade.assertAllowsNewObligation(departure, action)
  }
}
