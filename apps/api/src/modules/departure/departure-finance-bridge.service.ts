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
  SegmentPayableStatus,
  SourceOrderReceivableStatus,
  deriveScheduleState,
  PaymentScheduleStatus,
  ResourceKind,
} from '@xiaotuanbao/shared'
import {
  CounterpartyType,
  DepartureStatus,
  PaymentScheduleDirection,
  type Partner,
  type PaymentSchedule,
  type SegmentResource,
  type SourceOrder,
  type Supplier,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { PaymentScheduleService } from '../finance/payment-schedule.service'
import { VerificationService } from '../finance/verification.service'
import { formatDateOnly, getShanghaiTodayString } from './departure-date.utils'

type SourceOrderWithRelations = SourceOrder & {
  partner: Partner
  departure: { id: string; organizationId: string; status: string; endDate: Date }
}

interface ReceivablePathSpec {
  sourceType: PaymentScheduleSourceType
  amountCents: number
  title: string
  counterpartyType: CounterpartyType
  counterpartyId?: string
  counterpartyName?: string
}

export interface SourceOrderFinanceMeta {
  hasSchedule: boolean
  receivableStatus: SourceOrderReceivableStatus
  hasSourceAmountMismatch: boolean
  amountFieldsLocked: boolean
}

export interface SegmentResourceFinanceMeta {
  hasSchedule: boolean
  payableStatus: SegmentPayableStatus
  hasSourceAmountMismatch: boolean
  amountFieldsLocked: boolean
}

type SegmentResourceWithRelations = SegmentResource & {
  partner: Partner | null
  supplier: Supplier | null
  segment: {
    id: string
    endDate: Date
    departure: { id: string; organizationId: string; status: string; endDate: Date }
  }
}

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
  ) {}

  async generateReceivables(
    organizationId: string,
    sourceOrderId: string,
    toSourceOrderSummary: (
      order: SourceOrder & { partner: Partner },
      meta: SourceOrderFinanceMeta,
    ) => SourceOrderSummary,
  ): Promise<GenerateReceivablesResult> {
    const order = await this.loadSourceOrderOrThrow(organizationId, sourceOrderId)
    this.ensureDepartureOpen(order.departure)

    const existingSchedules = await this.loadReceivableSchedules(organizationId, sourceOrderId)
    if (existingSchedules.length > 0) {
      throw new ConflictException('当前客源单已生成应收，不能再次生成')
    }

    const paths = this.buildReceivablePaths(order)
    const schedules: PaymentScheduleSummary[] = []
    const dueDate = formatDateOnly(order.departure.endDate)

    for (const path of paths) {
      if (path.amountCents <= 0) {
        continue
      }

      const created = await this.paymentScheduleService.create(
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
          sourceId: sourceOrderId,
        },
      )
      schedules.push(created)
    }

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
      const settledAmountCents = await this.verificationService.getSettledAmountCents(
        schedule.id,
      )
      const touched = isFinanceTouched(schedule, settledAmountCents)
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
      const dueDate = formatDateOnly(order.departure.endDate)

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

    let hasSourceAmountMismatch = false
    let amountFieldsLocked = false
    const scheduleStates = activeSchedules.map((schedule) => {
      const settledAmountCents = settledMap.get(schedule.id) ?? 0
      const touched = isFinanceTouched(schedule, settledAmountCents)
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
    const resource = await this.loadSegmentResourceOrThrow(organizationId, resourceId)
    this.ensureDepartureOpen(resource.segment.departure, '生成应付')

    if (resource.amountCents <= 0) {
      throw new BadRequestException('资源金额须大于 0 才能生成应付')
    }

    const existingTrace = await this.findAnyPayableSchedule(organizationId, resourceId)
    if (existingTrace) {
      throw new ConflictException('当前资源已生成应付，不能再次生成')
    }

    const spec = this.buildPayableSpec(resource)
    const dueDate = formatDateOnly(resource.segment.departure.endDate)

    const schedule = await this.paymentScheduleService.create(
      organizationId,
      PaymentScheduleDirection.payable,
      {
        departureId: resource.segment.departure.id,
        title: spec.title,
        amountCents: spec.amountCents,
        dueDate,
        counterpartyType: spec.counterpartyType,
        counterpartyId: spec.counterpartyId,
        counterpartyName: spec.counterpartyName,
        sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
        sourceId: resourceId,
      },
    )

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
    const settledAmountCents = await this.verificationService.getSettledAmountCents(schedule.id)
    const touched = isFinanceTouched(schedule, settledAmountCents)

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
    const amounts =
      resource ??
      (await this.prisma.segmentResource.findFirstOrThrow({
        where: { id: resourceId },
        select: {
          amountCents: true,
          resourceKind: true,
          partnerId: true,
          supplierId: true,
        },
      }))

    const schedule =
      (await this.findActivePayableSchedule(organizationId, resourceId)) ??
      (await this.findCancelledPayableSchedule(organizationId, resourceId))
    if (!schedule) {
      return {
        hasSchedule: false,
        payableStatus: SegmentPayableStatus.NOT_GENERATED,
        hasSourceAmountMismatch: false,
        amountFieldsLocked: false,
      }
    }

    if (schedule.cancelledAt != null) {
      return {
        hasSchedule: true,
        payableStatus: SegmentPayableStatus.CLOSED,
        hasSourceAmountMismatch: false,
        amountFieldsLocked: true,
      }
    }

    const settledAmountCents = await this.verificationService.getSettledAmountCents(schedule.id)
    const touched = isFinanceTouched(schedule, settledAmountCents)
    const expectedAmount = amounts.amountCents

    let hasSourceAmountMismatch = false
    let amountFieldsLocked = false

    if (touched) {
      amountFieldsLocked = true
      if (expectedAmount > 0 && schedule.amountCents !== expectedAmount) {
        hasSourceAmountMismatch = true
      }
    }

    const status = deriveScheduleState({
      amountCents: schedule.amountCents,
      settledAmountCents,
      dueDate: formatDateOnly(schedule.dueDate),
      cancelledAt: schedule.cancelledAt,
      businessDate: getShanghaiTodayString(),
    })

    let payableStatus = SegmentPayableStatus.PENDING
    if (status === PaymentScheduleStatus.SETTLED) {
      payableStatus = SegmentPayableStatus.PAID
      amountFieldsLocked = true
    } else if (settledAmountCents > 0 && settledAmountCents < schedule.amountCents) {
      payableStatus = SegmentPayableStatus.PARTIAL
    }

    return {
      hasSchedule: true,
      payableStatus,
      hasSourceAmountMismatch,
      amountFieldsLocked,
    }
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
      },
    })
  }

  private async findCancelledPayableSchedule(
    organizationId: string,
    resourceId: string,
  ): Promise<PaymentSchedule | null> {
    return this.prisma.paymentSchedule.findFirst({
      where: {
        organizationId,
        sourceId: resourceId,
        sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
        direction: PaymentScheduleDirection.payable,
        cancelledAt: { not: null },
      },
      orderBy: { cancelledAt: 'desc' },
    })
  }

  private async findAnyPayableSchedule(
    organizationId: string,
    resourceId: string,
  ): Promise<PaymentSchedule | null> {
    return this.prisma.paymentSchedule.findFirst({
      where: {
        organizationId,
        sourceId: resourceId,
        sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE,
        direction: PaymentScheduleDirection.payable,
      },
    })
  }

  private async loadSegmentResourceOrThrow(
    organizationId: string,
    resourceId: string,
  ): Promise<SegmentResourceWithRelations> {
    const resource = await this.prisma.segmentResource.findFirst({
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

  private buildReceivablePaths(order: SourceOrderWithRelations): ReceivablePathSpec[] {
    const paths: ReceivablePathSpec[] = []

    if (order.partnerCollectedCents > 0) {
      paths.push({
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
        amountCents: order.partnerCollectedCents,
        title: '客户补款',
        counterpartyType: CounterpartyType.partner,
        counterpartyId: order.partnerId,
      })
    }

    if (order.guestCollectCents > 0) {
      paths.push({
        sourceType: PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
        amountCents: order.guestCollectCents,
        title: '游客代收',
        counterpartyType: CounterpartyType.guest,
        counterpartyName: order.displayName,
      })
    }

    return paths
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
  ): Promise<PaymentSchedule[]> {
    return this.prisma.paymentSchedule.findMany({
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
  ): Promise<SourceOrderWithRelations> {
    const order = await this.prisma.sourceOrder.findFirst({
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

  private ensureDepartureOpen(departure: { status: string }, action = '生成应收') {
    if (departure.status === DepartureStatus.closed) {
      throw new ConflictException(`发团已关闭，不可${action}`)
    }
  }
}
