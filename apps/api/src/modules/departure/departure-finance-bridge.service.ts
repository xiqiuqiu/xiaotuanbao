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
  PaymentScheduleStatus,
} from '@xiaotuanbao/shared'
import {
  CounterpartyType,
  DepartureStatus,
  PaymentScheduleDirection,
  type Partner,
  type PaymentSchedule,
  type SourceOrder,
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

    const paths = this.buildReceivablePaths(order)
    const schedules: PaymentScheduleSummary[] = []
    let sourceAmountMismatch = false
    const dueDate = formatDateOnly(order.departure.endDate)

    for (const path of paths) {
      if (path.amountCents <= 0) {
        continue
      }

      const existing = await this.findActiveSchedule(
        organizationId,
        sourceOrderId,
        path.sourceType,
      )

      if (!existing) {
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
        continue
      }

      const settledAmountCents = await this.verificationService.getSettledAmountCents(
        existing.id,
      )
      const touched = isFinanceTouched(existing, settledAmountCents)

      if (touched) {
        if (existing.amountCents !== path.amountCents) {
          sourceAmountMismatch = true
        }
        schedules.push(
          await this.paymentScheduleService.getById(
            organizationId,
            PaymentScheduleDirection.receivable,
            existing.id,
          ),
        )
        continue
      }

      if (existing.amountCents !== path.amountCents) {
        const updated = await this.paymentScheduleService.update(
          organizationId,
          PaymentScheduleDirection.receivable,
          existing.id,
          { amountCents: path.amountCents },
        )
        schedules.push(updated)
      } else {
        schedules.push(
          await this.paymentScheduleService.getById(
            organizationId,
            PaymentScheduleDirection.receivable,
            existing.id,
          ),
        )
      }
    }

    const financeMeta = await this.evaluateFinanceMeta(organizationId, sourceOrderId, order)
    if (financeMeta.hasSourceAmountMismatch) {
      sourceAmountMismatch = true
    }

    return {
      schedules,
      sourceOrder: toSourceOrderSummary(order, financeMeta),
      sourceAmountMismatch,
    }
  }

  async syncSourceOrderSchedules(
    organizationId: string,
    order: SourceOrderWithRelations,
  ): Promise<SourceOrderFinanceMeta> {
    const schedules = await this.loadActiveReceivableSchedules(organizationId, order.id)

    for (const schedule of schedules) {
      const expectedAmount = this.getExpectedAmountForSchedule(schedule.sourceType, order)
      const settledAmountCents = await this.verificationService.getSettledAmountCents(
        schedule.id,
      )
      const touched = isFinanceTouched(schedule, settledAmountCents)

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

    const schedules = await this.loadActiveReceivableSchedules(organizationId, sourceOrderId)
    if (schedules.length === 0) {
      return {
        hasSchedule: false,
        receivableStatus: SourceOrderReceivableStatus.NOT_GENERATED,
        hasSourceAmountMismatch: false,
        amountFieldsLocked: false,
      }
    }

    const settledMap = await this.verificationService.batchGetSettledAmounts(
      schedules.map((schedule) => schedule.id),
    )

    let hasSourceAmountMismatch = false
    let amountFieldsLocked = false
    const scheduleStates = schedules.map((schedule) => {
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
      | 'guestCount'
      | 'unitPriceCents'
      | 'discountType'
      | 'discountCents'
      | 'collectionMode'
      | 'partnerCollectedCents'
    >,
    nextAmounts: Pick<
      SourceOrder,
      | 'guestCount'
      | 'unitPriceCents'
      | 'discountType'
      | 'discountCents'
      | 'collectionMode'
      | 'partnerCollectedCents'
    >,
  ): Promise<void> {
    const amountChanged =
      order.guestCount !== nextAmounts.guestCount ||
      order.unitPriceCents !== nextAmounts.unitPriceCents ||
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

  private async findActiveSchedule(
    organizationId: string,
    sourceOrderId: string,
    sourceType: PaymentScheduleSourceType,
  ): Promise<PaymentSchedule | null> {
    return this.prisma.paymentSchedule.findFirst({
      where: {
        organizationId,
        sourceId: sourceOrderId,
        sourceType,
        direction: PaymentScheduleDirection.receivable,
        cancelledAt: null,
      },
    })
  }

  private async loadActiveReceivableSchedules(
    organizationId: string,
    sourceOrderId: string,
  ): Promise<PaymentSchedule[]> {
    return this.prisma.paymentSchedule.findMany({
      where: {
        organizationId,
        sourceId: sourceOrderId,
        direction: PaymentScheduleDirection.receivable,
        cancelledAt: null,
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

  private ensureDepartureOpen(departure: { status: string }) {
    if (departure.status === DepartureStatus.closed) {
      throw new ConflictException('发团已关闭，不可生成应收')
    }
  }
}
