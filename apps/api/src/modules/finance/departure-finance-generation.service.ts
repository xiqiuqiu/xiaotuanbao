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
  classifySourceOrderInitialReceivables,
  classifyResourceInitialPayable,
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

type LoadedPayableResource =
  | { resourceKind: 'segment'; resource: SegmentResourceWithRelations }
  | { resourceKind: 'departure'; resource: DepartureResourceWithRelations }

interface PayableSpec {
  amountCents: number
  title: string
  counterpartyType: CounterpartyType
  counterpartyId?: string
  counterpartyName?: string
}

export type ReceivableGenerationStrategy = 'ordinary' | 'initial_only'
export type PayableGenerationStrategy = 'ordinary' | 'initial_only'

export type PayableGenerationResult = {
  resource: SegmentResourceWithRelations | DepartureResourceWithRelations
  resourceKind: 'segment' | 'departure'
  sourceType: string
  sourceId: string
  schedules: PaymentScheduleSummary[]
  existingScheduleIds?: string[]
  generation: 'created' | 'already_present' | 'not_needed'
}

export type ReceivableGenerationResult = {
  order: SourceOrderWithRelations
  schedules: PaymentScheduleSummary[]
  existingScheduleIds?: string[]
  generation: 'created' | 'already_present' | 'not_needed'
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
    options?: { client?: DbClient; strategy?: ReceivableGenerationStrategy },
  ): Promise<ReceivableGenerationResult> {
    if (options?.client) {
      return this.generateReceivableSchedulesInTx(
        options.client,
        organizationId,
        sourceOrderId,
        assertAllowsNewObligation,
        options.strategy ?? 'ordinary',
      )
    }
    return this.prisma.$transaction(
      (tx) =>
        this.generateReceivableSchedulesInTx(
          tx,
          organizationId,
          sourceOrderId,
          assertAllowsNewObligation,
          options?.strategy ?? 'ordinary',
        ),
      { maxWait: 20_000, timeout: 20_000 },
    )
  }

  async previewInitialReceivables(
    organizationId: string,
    sourceOrderId: string,
    client: DbClient = this.prisma,
  ) {
    const order = await loadSourceOrderOrThrow(client, organizationId, sourceOrderId)
    const existingSchedules = await loadReceivableSchedules(client, organizationId, sourceOrderId)
    const expectedPaths = this.buildReceivablePaths(order).filter((path) => path.amountCents > 0)
    const classification = classifySourceOrderInitialReceivables({
      expectedPaths,
      existingSchedules,
    })
    return { order, existingSchedules, expectedPaths, classification }
  }

  private async generateReceivableSchedulesInTx(
    tx: DbClient,
    organizationId: string,
    sourceOrderId: string,
    assertAllowsNewObligation: (departure: { status: string }, action?: string) => void,
    strategy: ReceivableGenerationStrategy,
  ): Promise<ReceivableGenerationResult> {
    await tx.$queryRaw`
      SELECT id
      FROM source_orders
      WHERE id = ${sourceOrderId}
      FOR UPDATE
    `

    const lockedOrder = await loadSourceOrderOrThrow(tx, organizationId, sourceOrderId)
    assertAllowsNewObligation(lockedOrder.departure, '提交应收')

    const existingSchedules = await loadReceivableSchedules(tx, organizationId, sourceOrderId)
    const dueDate = computeReceivableDueDate(formatDateOnly(lockedOrder.departure.startDate))
    const expectedPaths = this.buildReceivablePaths(lockedOrder).filter((path) => path.amountCents > 0)

    if (strategy === 'initial_only') {
      const classification = classifySourceOrderInitialReceivables({
        expectedPaths,
        existingSchedules,
      })
      if (classification.status === 'no_positive_paths') {
        return { order: lockedOrder, schedules: [], generation: 'not_needed' }
      }
      if (classification.status === 'complete_and_consistent') {
        return {
          order: lockedOrder,
          schedules: [],
          existingScheduleIds: classification.scheduleIds,
          generation: 'already_present',
        }
      }
      if (classification.status === 'anomaly') {
        throw new ConflictException(classification.message)
      }
      const createdSchedules: PaymentScheduleSummary[] = []
      for (const path of classification.paths) {
        createdSchedules.push(
          await this.paymentScheduleService.create(
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
          ),
        )
      }
      return { order: lockedOrder, schedules: createdSchedules, generation: 'created' }
    }

    const activeExisting = existingSchedules.filter((schedule) => schedule.cancelledAt == null)
    const activeByType = new Map(activeExisting.map((schedule) => [schedule.sourceType, schedule]))
    const missingPaths = expectedPaths.filter((path) => !activeByType.has(path.sourceType))

    if (activeExisting.length > 0 && missingPaths.length === 0) {
      throw new ConflictException('当前客源单已提交应收，不能再次提交')
    }
    if (activeExisting.length === 0 && existingSchedules.length > 0) {
      throw new ConflictException('当前客源单已提交应收，不能再次提交')
    }

    const createdSchedules: PaymentScheduleSummary[] = []
    const pathsToCreate = activeExisting.length === 0 ? expectedPaths : missingPaths

    for (const path of pathsToCreate) {
      createdSchedules.push(
        await this.paymentScheduleService.create(
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
        ),
      )
    }

    return { order: lockedOrder, schedules: createdSchedules, generation: 'created' }
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
    // Closed history is not "never generated" (ADR-0007 / generateReceivableSchedules).
    // Do not mint replacement paths over cancelled-only receivables.
    if (activeSchedules.length === 0 && activeRebates.length === 0) {
      return
    }

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
    // Include cancelled legacy nodes: overview still books closed-unreceived on them.
    const hasLegacyGuestCollection = allSchedules.some(
      (schedule) =>
        schedule.sourceType === PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION,
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

  async previewInitialPayable(
    organizationId: string,
    params: { sourceType: string; sourceId: string },
    client: DbClient = this.prisma,
  ) {
    const loaded = await this.loadPayableResourceOrThrow(organizationId, params, client)
    const existingSchedules = await this.findPayableSchedules(
      organizationId,
      params.sourceId,
      params.sourceType,
      client,
    )
    const spec = this.buildPayableSpec(loaded.resource)
    const classification = classifyResourceInitialPayable({
      resource: {
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        amountCents: spec.amountCents,
        title: spec.title,
      },
      existingSchedules,
    })
    return { ...loaded, existingSchedules, spec, classification }
  }

  async generateResourcePayable(
    organizationId: string,
    params: { sourceType: string; sourceId: string },
    assertAllowsNewObligation: (departure: { status: string }, action?: string) => void,
    options?: { client?: DbClient; strategy?: PayableGenerationStrategy },
  ): Promise<
    LoadedPayableResource & {
      schedule?: PaymentScheduleSummary
      generation?: PayableGenerationResult['generation']
      existingScheduleIds?: string[]
    }
  > {
    if (
      params.sourceType !== PaymentScheduleSourceType.SEGMENT_RESOURCE &&
      params.sourceType !== PaymentScheduleSourceType.DEPARTURE_RESOURCE
    ) {
      throw new BadRequestException('仅资源可提交应付')
    }
    if (options?.client) {
      return this.generateResourcePayableInTx(
        options.client,
        organizationId,
        params,
        assertAllowsNewObligation,
        options.strategy ?? 'ordinary',
      )
    }
    return this.prisma.$transaction(
      (tx) =>
        this.generateResourcePayableInTx(
          tx,
          organizationId,
          params,
          assertAllowsNewObligation,
          options?.strategy ?? 'ordinary',
        ),
      { maxWait: 20_000, timeout: 20_000 },
    )
  }

  async generatePayable(
    organizationId: string,
    resourceId: string,
    assertAllowsNewObligation: (departure: { status: string }, action?: string) => void,
  ): Promise<{
    schedule: PaymentScheduleSummary
    resource: SegmentResourceWithRelations
  }> {
    const result = await this.generateResourcePayable(
      organizationId,
      { sourceType: PaymentScheduleSourceType.SEGMENT_RESOURCE, sourceId: resourceId },
      assertAllowsNewObligation,
    )
    if (!result.schedule) {
      throw new BadRequestException('资源金额须大于 0 才能提交应付')
    }
    return {
      schedule: result.schedule,
      resource: result.resource as SegmentResourceWithRelations,
    }
  }

  async generateDepartureResourcePayable(
    organizationId: string,
    resourceId: string,
    assertAllowsNewObligation: (departure: { status: string }, action?: string) => void,
  ): Promise<{
    schedule: PaymentScheduleSummary
    resource: DepartureResourceWithRelations
  }> {
    const result = await this.generateResourcePayable(
      organizationId,
      { sourceType: PaymentScheduleSourceType.DEPARTURE_RESOURCE, sourceId: resourceId },
      assertAllowsNewObligation,
    )
    if (!result.schedule) {
      throw new BadRequestException('资源金额须大于 0 才能提交应付')
    }
    return {
      schedule: result.schedule,
      resource: result.resource as DepartureResourceWithRelations,
    }
  }

  private async generateResourcePayableInTx(
    tx: DbClient,
    organizationId: string,
    params: { sourceType: string; sourceId: string },
    assertAllowsNewObligation: (departure: { status: string }, action?: string) => void,
    strategy: PayableGenerationStrategy,
  ): Promise<
    LoadedPayableResource & {
      schedule?: PaymentScheduleSummary
      generation?: PayableGenerationResult['generation']
      existingScheduleIds?: string[]
    }
  > {
    if (params.sourceType === PaymentScheduleSourceType.SEGMENT_RESOURCE) {
      await tx.$queryRaw`
        SELECT id
        FROM segment_resources
        WHERE id = ${params.sourceId}
        FOR UPDATE
      `
    } else {
      await tx.$queryRaw`
        SELECT id
        FROM departure_resources
        WHERE id = ${params.sourceId}
        FOR UPDATE
      `
    }

    const loaded = await this.loadPayableResourceOrThrow(organizationId, params, tx)
    const departure =
      loaded.resourceKind === 'segment'
        ? loaded.resource.segment.departure
        : loaded.resource.departure
    assertAllowsNewObligation(departure, '提交应付')

    const existingSchedules = await this.findPayableSchedules(
      organizationId,
      params.sourceId,
      params.sourceType,
      tx,
    )
    const spec = this.buildPayableSpec(loaded.resource)

    if (strategy === 'initial_only') {
      const classification = classifyResourceInitialPayable({
        resource: {
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          amountCents: spec.amountCents,
          title: spec.title,
        },
        existingSchedules,
      })
      if (classification.status === 'no_positive_amount') {
        return { ...loaded, generation: 'not_needed' }
      }
      if (classification.status === 'complete_and_consistent') {
        return {
          ...loaded,
          existingScheduleIds: classification.scheduleIds,
          generation: 'already_present',
        }
      }
      if (classification.status === 'anomaly') {
        throw new ConflictException(classification.message)
      }
    } else {
      if (spec.amountCents <= 0) {
        throw new BadRequestException('资源金额须大于 0 才能提交应付')
      }
      if (existingSchedules.some((schedule) => schedule.voidedAt == null)) {
        throw new ConflictException('当前资源已提交应付，不能再次提交')
      }
    }

    const createdSchedule = await this.paymentScheduleService.create(
      organizationId,
      PaymentScheduleDirection.payable,
      {
        departureId: departure.id,
        title: spec.title,
        amountCents: spec.amountCents,
        dueDate: formatDateOnly(departure.endDate),
        counterpartyType: spec.counterpartyType,
        counterpartyId: spec.counterpartyId,
        counterpartyName: spec.counterpartyName,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
      },
      tx,
    )
    return { ...loaded, schedule: createdSchedule, generation: 'created' }
  }

  private async loadPayableResourceOrThrow(
    organizationId: string,
    params: { sourceType: string; sourceId: string },
    client: DbClient,
  ): Promise<LoadedPayableResource> {
    if (params.sourceType === PaymentScheduleSourceType.SEGMENT_RESOURCE) {
      return {
        resource: await this.loadSegmentResourceOrThrow(organizationId, params.sourceId, client),
        resourceKind: 'segment',
      }
    }
    if (params.sourceType === PaymentScheduleSourceType.DEPARTURE_RESOURCE) {
      return {
        resource: await this.loadDepartureResourceOrThrow(organizationId, params.sourceId, client),
        resourceKind: 'departure',
      }
    }
    throw new BadRequestException('仅资源可提交应付')
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

  private async findPayableSchedules(
    organizationId: string,
    resourceId: string,
    sourceType: string,
    client: DbClient = this.prisma,
  ): Promise<PaymentSchedule[]> {
    return client.paymentSchedule.findMany({
      where: {
        organizationId,
        sourceId: resourceId,
        sourceType,
        direction: PaymentScheduleDirection.payable,
      },
      orderBy: { createdAt: 'asc' },
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
