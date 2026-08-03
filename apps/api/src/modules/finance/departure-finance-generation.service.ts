import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import {
  isFinanceTouched,
  PaymentScheduleSourceType,
  computeReceivableDueDate,
  shouldCancelSourceOrderScheduleOnConventionSync,
} from '@xiaotuanbao/shared'
import {
  CounterpartyType,
  PaymentScheduleCloseDisposition,
  PaymentScheduleDirection,
  type DepartureResource,
  type Partner,
  type PaymentSchedule,
  type SegmentResource,
  type Supplier,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { formatDateOnly } from '../departure/departure-date.utils'
import { buildSourceOrderReceivablePaths } from '../departure/source-order-receivable-paths'
import type { PaymentScheduleService } from './payment-schedule.service'
import { VerificationService } from './verification.service'

function paymentScheduleServiceToken() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./payment-schedule.service')
    .PaymentScheduleService as typeof import('./payment-schedule.service').PaymentScheduleService
}
import {
  loadReceivableSchedules,
  loadRebateSchedules,
  loadSourceOrderOrThrow,
  type DbClient,
  type SourceOrderWithRelations,
} from './departure-finance-schedule-loaders'

type SegmentResourceWithRelations = SegmentResource & {
  partner: Partner | null
  supplier: Supplier | null
  segment: {
    id: string
    endDate: Date | null
    departure: { id: string; organizationId: string; status: string; endDate: Date }
  }
}

type DepartureResourceWithRelations = DepartureResource & {
  partner: Partner | null
  supplier: Supplier | null
  departure: { id: string; organizationId: string; status: string; endDate: Date }
}

interface PayableSpec {
  amountCents: number
  title: string
  counterpartyType: CounterpartyType
  counterpartyId?: string
  counterpartyName?: string
}

/**
 * Finance-owned Generation + convention sync implementation (ADR-0004 step 2).
 * Public seam is DepartureFinanceFacade; this class is the deep implementation.
 */
@Injectable()
export class DepartureFinanceGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(paymentScheduleServiceToken))
    private readonly paymentScheduleService: PaymentScheduleService,
    private readonly verificationService: VerificationService,
  ) {}

  async generateReceivableSchedules(
    organizationId: string,
    sourceOrderId: string,
    assertAllowsNewObligation: (departure: { status: string }, action?: string) => void,
  ): Promise<{ order: SourceOrderWithRelations; schedules: PaymentScheduleSummary[] }> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT id
          FROM source_orders
          WHERE id = ${sourceOrderId}
          FOR UPDATE
        `

        const lockedOrder = await loadSourceOrderOrThrow(tx, organizationId, sourceOrderId)
        assertAllowsNewObligation(lockedOrder.departure)

        const existingSchedules = await loadReceivableSchedules(
          tx,
          organizationId,
          sourceOrderId,
        )
        const activeExisting = existingSchedules.filter((schedule) => schedule.cancelledAt == null)
        const dueDate = computeReceivableDueDate(formatDateOnly(lockedOrder.departure.startDate))
        const expectedPaths = this.buildReceivablePaths(lockedOrder).filter(
          (path) => path.amountCents > 0,
        )
        const activeByType = new Map(
          activeExisting.map((schedule) => [schedule.sourceType, schedule]),
        )
        const missingPaths = expectedPaths.filter((path) => !activeByType.has(path.sourceType))

        if (activeExisting.length > 0 && missingPaths.length === 0) {
          throw new ConflictException('当前客源单已提交应收，不能再次提交')
        }
        if (activeExisting.length === 0 && existingSchedules.length > 0) {
          throw new ConflictException('当前客源单已提交应收，不能再次提交')
        }

        const createdSchedules: PaymentScheduleSummary[] = []
        const pathsToCreate =
          activeExisting.length === 0 ? expectedPaths : missingPaths

        for (const path of pathsToCreate) {
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
      },
      { maxWait: 20_000, timeout: 20_000 },
    )
  }

  /**
   * Syncs receivable/rebate schedules to source-order convention when untouched.
   * Caller evaluates finance meta after this returns.
   */
  async syncSourceOrderConvention(
    organizationId: string,
    order: SourceOrderWithRelations,
  ): Promise<void> {
    const allSchedules = await loadReceivableSchedules(this.prisma, organizationId, order.id)
    const rebateSchedules = await loadRebateSchedules(this.prisma, organizationId, order.id)
    if (allSchedules.length === 0 && rebateSchedules.length === 0) {
      return
    }

    const activeSchedules = allSchedules.filter((schedule) => schedule.cancelledAt == null)
    const activeRebates = rebateSchedules.filter((schedule) => schedule.cancelledAt == null)
    const schedulesForTouch = [...activeSchedules, ...activeRebates]

    const touchResults = await Promise.all(
      schedulesForTouch.map(async (schedule) => {
        const [settledAmountCents, hasVerificationHistory] = await Promise.all([
          this.verificationService.getSettledAmountCents(schedule.id),
          this.verificationService.hasVerificationHistory(schedule.id),
        ])
        return {
          schedule,
          touched: isFinanceTouched(schedule, settledAmountCents, hasVerificationHistory),
        }
      }),
    )
    const anyTouched = touchResults.some((item) => item.touched)
    const hasLegacyGuestCollection = touchResults.some(
      (item) =>
        item.schedule.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
    )

    if (anyTouched || hasLegacyGuestCollection) {
      return
    }

    const expectedPaths = this.buildReceivablePaths(order)
    const expectedByType = new Map(expectedPaths.map((path) => [path.sourceType, path]))
    const dueDate = computeReceivableDueDate(formatDateOnly(order.departure.startDate))
    const remainingActiveSourceTypes = new Set<string>()

    for (const { schedule } of touchResults) {
      if (schedule.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_REBATE) {
        await this.cancelScheduleForConventionSync(schedule.id)
        continue
      }

      const expected = expectedByType.get(schedule.sourceType as PaymentScheduleSourceType)
      if (
        shouldCancelSourceOrderScheduleOnConventionSync({
          scheduleSourceType: schedule.sourceType,
          expectedAmountCents: expected?.amountCents,
        })
      ) {
        await this.cancelScheduleForConventionSync(schedule.id)
        continue
      }
      if (!expected || expected.amountCents <= 0) {
        continue
      }

      remainingActiveSourceTypes.add(schedule.sourceType)
      if (schedule.amountCents === expected.amountCents && schedule.title === expected.title) {
        continue
      }
      await this.paymentScheduleService.update(
        organizationId,
        PaymentScheduleDirection.receivable,
        schedule.id,
        { amountCents: expected.amountCents, title: expected.title },
      )
    }

    for (const path of expectedPaths) {
      if (path.amountCents <= 0 || remainingActiveSourceTypes.has(path.sourceType)) {
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
      remainingActiveSourceTypes.add(path.sourceType)
    }
  }

  async generateResourcePayable(
    organizationId: string,
    params: { sourceType: string; sourceId: string },
    assertAllowsNewObligation: (departure: { status: string }, action?: string) => void,
  ): Promise<{
    schedule: PaymentScheduleSummary
    resource: SegmentResourceWithRelations | DepartureResourceWithRelations
    resourceKind: 'segment' | 'departure'
  }> {
    if (params.sourceType === PaymentScheduleSourceType.SEGMENT_RESOURCE) {
      const result = await this.generatePayable(
        organizationId,
        params.sourceId,
        assertAllowsNewObligation,
      )
      return { ...result, resourceKind: 'segment' }
    }
    if (params.sourceType === PaymentScheduleSourceType.DEPARTURE_RESOURCE) {
      const result = await this.generateDepartureResourcePayable(
        organizationId,
        params.sourceId,
        assertAllowsNewObligation,
      )
      return { ...result, resourceKind: 'departure' }
    }
    throw new BadRequestException('仅资源可提交应付')
  }

  async generatePayable(
    organizationId: string,
    resourceId: string,
    assertAllowsNewObligation: (departure: { status: string }, action?: string) => void,
  ): Promise<{
    schedule: PaymentScheduleSummary
    resource: SegmentResourceWithRelations
  }> {
    return this.prisma.$transaction(
      async (tx) => {
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
        assertAllowsNewObligation(lockedResource.segment.departure, '提交应付')

        if (lockedResource.amountCents <= 0) {
          throw new BadRequestException('资源金额须大于 0 才能提交应付')
        }

        const existingTrace = await this.findAnyPayableSchedule(
          organizationId,
          resourceId,
          PaymentScheduleSourceType.SEGMENT_RESOURCE,
          tx,
        )
        if (existingTrace) {
          throw new ConflictException('当前资源已提交应付，不能再次提交')
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
      },
      { maxWait: 20_000, timeout: 20_000 },
    )
  }

  async generateDepartureResourcePayable(
    organizationId: string,
    resourceId: string,
    assertAllowsNewObligation: (departure: { status: string }, action?: string) => void,
  ): Promise<{
    schedule: PaymentScheduleSummary
    resource: DepartureResourceWithRelations
  }> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT id
          FROM departure_resources
          WHERE id = ${resourceId}
          FOR UPDATE
        `

        const lockedResource = await this.loadDepartureResourceOrThrow(
          organizationId,
          resourceId,
          tx,
        )
        assertAllowsNewObligation(lockedResource.departure, '提交应付')

        if (lockedResource.amountCents <= 0) {
          throw new BadRequestException('资源金额须大于 0 才能提交应付')
        }

        const existingTrace = await this.findAnyPayableSchedule(
          organizationId,
          resourceId,
          PaymentScheduleSourceType.DEPARTURE_RESOURCE,
          tx,
        )
        if (existingTrace) {
          throw new ConflictException('当前资源已提交应付，不能再次提交')
        }

        const spec = this.buildPayableSpec(lockedResource)
        const dueDate = formatDateOnly(lockedResource.departure.endDate)
        const createdSchedule = await this.paymentScheduleService.create(
          organizationId,
          PaymentScheduleDirection.payable,
          {
            departureId: lockedResource.departure.id,
            title: spec.title,
            amountCents: spec.amountCents,
            dueDate,
            counterpartyType: spec.counterpartyType,
            counterpartyId: spec.counterpartyId,
            counterpartyName: spec.counterpartyName,
            sourceType: PaymentScheduleSourceType.DEPARTURE_RESOURCE,
            sourceId: resourceId,
          },
          tx,
        )

        return { resource: lockedResource, schedule: createdSchedule }
      },
      { maxWait: 20_000, timeout: 20_000 },
    )
  }

  async syncSegmentResourceConvention(
    organizationId: string,
    resource: SegmentResourceWithRelations,
  ): Promise<void> {
    const schedule = await this.findActivePayableSchedule(
      organizationId,
      resource.id,
      PaymentScheduleSourceType.SEGMENT_RESOURCE,
    )
    if (!schedule) {
      return
    }
    const spec = this.buildPayableSpec(resource)
    await this.syncUntouchedPayableSchedule(organizationId, schedule, spec)
  }

  async syncDepartureResourceConvention(
    organizationId: string,
    resource: DepartureResourceWithRelations,
  ): Promise<void> {
    const schedule = await this.findActivePayableSchedule(
      organizationId,
      resource.id,
      PaymentScheduleSourceType.DEPARTURE_RESOURCE,
    )
    if (!schedule) {
      return
    }
    const spec = this.buildPayableSpec(resource)
    await this.syncUntouchedPayableSchedule(organizationId, schedule, spec)
  }

  private buildReceivablePaths(order: SourceOrderWithRelations) {
    return buildSourceOrderReceivablePaths({
      sourceOrderId: order.id,
      partnerId: order.partnerId,
      partnerName: order.partner.name,
      displayName: order.displayName,
      collectionMode: order.collectionMode,
      depositCents: order.depositCents,
      balanceCents: order.balanceCents,
      netReceivableCents: order.netReceivableCents,
    })
  }

  private async cancelScheduleForConventionSync(scheduleId: string): Promise<void> {
    await this.prisma.paymentSchedule.update({
      where: { id: scheduleId },
      data: {
        cancelledAt: new Date(),
        closeDisposition: PaymentScheduleCloseDisposition.other,
        cancelReason: '约定变更同步：路径不再适用',
      },
    })
  }

  private async syncUntouchedPayableSchedule(
    organizationId: string,
    schedule: PaymentSchedule,
    spec: PayableSpec,
  ): Promise<void> {
    const [settledAmountCents, hasVerificationHistory] = await Promise.all([
      this.verificationService.getSettledAmountCents(schedule.id),
      this.verificationService.hasVerificationHistory(schedule.id),
    ])
    const touched = isFinanceTouched(schedule, settledAmountCents, hasVerificationHistory)
    if (touched) {
      return
    }

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

  private buildPayableSpec(
    resource: SegmentResourceWithRelations | DepartureResourceWithRelations,
  ): PayableSpec {
    const isPartnerCounterparty = resource.counterpartyType === CounterpartyType.partner
    const counterpartyName = isPartnerCounterparty
      ? resource.partner?.name
      : resource.supplier?.name

    const title =
      resource.title.trim() ||
      `${this.resourceKindLabel(resource.resourceKind)}·${counterpartyName ?? '未命名'}`

    if (isPartnerCounterparty) {
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
      meal: '用餐',
      insurance: '保险',
      outsource: '拼出',
      other: '其他',
    }
    return labels[resourceKind] ?? resourceKind
  }

  private async findActivePayableSchedule(
    organizationId: string,
    resourceId: string,
    sourceType: string,
  ): Promise<PaymentSchedule | null> {
    return this.prisma.paymentSchedule.findFirst({
      where: {
        organizationId,
        sourceId: resourceId,
        sourceType,
        direction: PaymentScheduleDirection.payable,
        cancelledAt: null,
        voidedAt: null,
      },
    })
  }

  private async findAnyPayableSchedule(
    organizationId: string,
    resourceId: string,
    sourceType: string = PaymentScheduleSourceType.SEGMENT_RESOURCE,
    client: DbClient = this.prisma,
  ): Promise<PaymentSchedule | null> {
    return client.paymentSchedule.findFirst({
      where: {
        organizationId,
        sourceId: resourceId,
        sourceType,
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

  private async loadDepartureResourceOrThrow(
    organizationId: string,
    resourceId: string,
    client: DbClient = this.prisma,
  ): Promise<DepartureResourceWithRelations> {
    const resource = await client.departureResource.findFirst({
      where: {
        id: resourceId,
        departure: { organizationId },
      },
      include: {
        partner: true,
        supplier: true,
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

    if (!resource) {
      throw new NotFoundException('发团级资源不存在')
    }

    return resource
  }
}
