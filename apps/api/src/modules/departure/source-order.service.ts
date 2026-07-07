import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  GenerateReceivablesResult,
  SourceOrderGuestSummary,
  SourceOrderListResult,
  SourceOrderSummary,
} from '@xiaotuanbao/shared'
import {
  SourceOrderReceivableStatus,
} from '@xiaotuanbao/shared'
import {
  DepartureStatus,
  DirectoryProfileStatus,
  type Departure,
  type Partner,
  type Prisma,
  type SourceOrder,
  type SourceOrderGuest,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import type {
  CreateSourceOrderDto,
  CreateSourceOrderGuestDto,
  ListSourceOrdersQueryDto,
  UpdateSourceOrderDto,
  UpdateSourceOrderGuestDto,
} from './dto/source-order.dto'
import {
  buildSourceOrderDisplayName,
  computeSourceOrderAmounts,
} from './source-order.utils'
import { validateSourceOrderInput } from './source-order.validation'
import {
  DepartureFinanceBridgeService,
  type SourceOrderFinanceMeta,
} from './departure-finance-bridge.service'

type SourceOrderWithPartner = SourceOrder & { partner: Partner }

@Injectable()
export class SourceOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeBridge: DepartureFinanceBridgeService,
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
      include: { partner: true },
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
        totalDiscountCents: items.reduce((sum, item) => sum + item.discountCents, 0),
        totalNetReceivableCents: items.reduce((sum, item) => sum + item.netReceivableCents, 0),
        totalGuestCollectCents: items.reduce((sum, item) => sum + item.guestCollectCents, 0),
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
    const normalized = this.normalizeInput(dto)

    validateSourceOrderInput({
      partnerId: partner.id,
      ...normalized,
    })

    const amounts = computeSourceOrderAmounts(normalized)
    const displayName = await this.generateDisplayName(
      departure,
      partner.name,
      partner.id,
    )

    const created = await this.prisma.sourceOrder.create({
      data: {
        departureId: departure.id,
        partnerId: partner.id,
        displayName,
        guestCount: normalized.guestCount,
        unitPriceCents: normalized.unitPriceCents,
        grossReceivableCents: amounts.grossReceivableCents,
        discountType: normalized.discountType,
        discountCents: amounts.discountCents,
        discountNotes: dto.discountNotes?.trim() || null,
        netReceivableCents: amounts.netReceivableCents,
        collectionMode: normalized.collectionMode,
        partnerCollectedCents: amounts.partnerCollectedCents,
        guestCollectCents: amounts.guestCollectCents,
        settlementNotes: dto.settlementNotes?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
      include: { partner: true },
    })

    return this.toSourceOrderSummary(created, {
      hasSchedule: false,
      receivableStatus: SourceOrderReceivableStatus.NOT_GENERATED,
      hasSourceAmountMismatch: false,
      amountFieldsLocked: false,
    })
  }

  async generateReceivables(
    organizationId: string,
    sourceOrderId: string,
  ): Promise<GenerateReceivablesResult> {
    return this.financeBridge.generateReceivables(
      organizationId,
      sourceOrderId,
      (order, meta) => this.toSourceOrderSummary(order, meta),
    )
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

    const normalized = this.normalizeInput({
      guestCount: dto.guestCount ?? order.guestCount,
      unitPriceCents: dto.unitPriceCents ?? order.unitPriceCents,
      discountType: dto.discountType ?? order.discountType,
      discountCents: dto.discountCents ?? order.discountCents,
      collectionMode: dto.collectionMode ?? order.collectionMode,
      partnerCollectedCents:
        dto.partnerCollectedCents ??
        (dto.collectionMode !== undefined ? undefined : order.partnerCollectedCents),
    }, order)

    validateSourceOrderInput({
      partnerId: partner.id,
      ...normalized,
    })

    const amounts = computeSourceOrderAmounts(normalized)

    await this.financeBridge.assertAmountFieldsEditable(
      organizationId,
      order.id,
      order,
      {
        guestCount: normalized.guestCount,
        unitPriceCents: normalized.unitPriceCents,
        discountType: normalized.discountType,
        discountCents: amounts.discountCents,
        collectionMode: normalized.collectionMode,
        partnerCollectedCents: amounts.partnerCollectedCents,
      },
    )

    const displayName =
      dto.partnerId !== undefined
        ? await this.generateDisplayName(order.departure, partner.name, partner.id, order.id)
        : order.displayName

    const updated = await this.prisma.sourceOrder.update({
      where: { id: order.id },
      data: {
        partnerId: partner.id,
        displayName,
        guestCount: normalized.guestCount,
        unitPriceCents: normalized.unitPriceCents,
        grossReceivableCents: amounts.grossReceivableCents,
        discountType: normalized.discountType,
        discountCents: amounts.discountCents,
        discountNotes:
          dto.discountNotes !== undefined ? dto.discountNotes?.trim() || null : undefined,
        netReceivableCents: amounts.netReceivableCents,
        collectionMode: normalized.collectionMode,
        partnerCollectedCents: amounts.partnerCollectedCents,
        guestCollectCents: amounts.guestCollectCents,
        settlementNotes:
          dto.settlementNotes !== undefined ? dto.settlementNotes?.trim() || null : undefined,
        notes: dto.notes !== undefined ? dto.notes?.trim() || null : undefined,
      },
      include: { partner: true, departure: true },
    })

    const financeMeta = await this.financeBridge.syncSourceOrderSchedules(
      organizationId,
      updated,
    )
    return this.toSourceOrderSummary(updated, financeMeta)
  }

  async remove(organizationId: string, sourceOrderId: string): Promise<void> {
    const order = await this.findSourceOrderOrThrow(organizationId, sourceOrderId)
    this.ensureDepartureEditable(order.departure)

    const hasSchedule = await this.prisma.paymentSchedule.count({
      where: {
        organizationId,
        sourceId: order.id,
        cancelledAt: null,
      },
    })

    if (hasSchedule > 0) {
      throw new ConflictException('当前客源单已生成应收，不能直接删除')
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

  async syncGuestCount(
    organizationId: string,
    sourceOrderId: string,
  ): Promise<SourceOrderSummary> {
    const order = await this.findSourceOrderOrThrow(organizationId, sourceOrderId)
    this.ensureDepartureEditable(order.departure)

    const guestCount = await this.prisma.sourceOrderGuest.count({
      where: { sourceOrderId: order.id },
    })

    if (guestCount < 1) {
      throw new BadRequestException('客人名单为空，无法同步人数')
    }

    return this.update(organizationId, sourceOrderId, { guestCount })
  }

  private normalizeInput(
    dto: Pick<
      CreateSourceOrderDto,
      | 'guestCount'
      | 'unitPriceCents'
      | 'discountType'
      | 'discountCents'
      | 'collectionMode'
      | 'partnerCollectedCents'
    >,
    existing?: SourceOrder,
  ) {
    const discountType = dto.discountType
    const discountCents =
      discountType === 'lump_sum' ? Math.max(dto.discountCents ?? 0, 0) : 0
    const collectionMode = dto.collectionMode
    const gross = dto.unitPriceCents * dto.guestCount
    const net = gross - discountCents

    let partnerCollectedCents = 0
    if (collectionMode === 'partner_settled') {
      partnerCollectedCents = net
    } else if (collectionMode === 'split') {
      partnerCollectedCents =
        dto.partnerCollectedCents ??
        existing?.partnerCollectedCents ??
        0
    }

    return {
      guestCount: dto.guestCount,
      unitPriceCents: dto.unitPriceCents,
      discountType,
      discountCents,
      collectionMode,
      partnerCollectedCents,
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

    return buildSourceOrderDisplayName(
      partnerName,
      departure.startDate,
      existingCount + 1,
    )
  }

  private async loadScheduleMeta(organizationId: string, sourceOrderIds: string[]) {
    const map = new Map<string, SourceOrderFinanceMeta>()

    await Promise.all(
      sourceOrderIds.map(async (sourceOrderId) => {
        const meta = await this.financeBridge.evaluateFinanceMeta(organizationId, sourceOrderId)
        map.set(sourceOrderId, meta)
      }),
    )

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
    if (departure.status === DepartureStatus.closed) {
      throw new ConflictException('发团已关闭，不可编辑')
    }
  }

  private toSourceOrderSummary(
    order: SourceOrderWithPartner,
    scheduleMeta?: SourceOrderFinanceMeta,
  ): SourceOrderSummary {
    return {
      id: order.id,
      departureId: order.departureId,
      partnerId: order.partnerId,
      partnerName: order.partner.name,
      displayName: order.displayName,
      guestCount: order.guestCount,
      unitPriceCents: order.unitPriceCents,
      grossReceivableCents: order.grossReceivableCents,
      discountType: order.discountType,
      discountCents: order.discountCents,
      discountNotes: order.discountNotes,
      netReceivableCents: order.netReceivableCents,
      collectionMode: order.collectionMode,
      partnerCollectedCents: order.partnerCollectedCents,
      guestCollectCents: order.guestCollectCents,
      settlementNotes: order.settlementNotes,
      notes: order.notes,
      receivableStatus:
        scheduleMeta?.receivableStatus ?? SourceOrderReceivableStatus.NOT_GENERATED,
      hasPaymentSchedule: scheduleMeta?.hasSchedule ?? false,
      hasSourceAmountMismatch: scheduleMeta?.hasSourceAmountMismatch ?? false,
      amountFieldsLocked: scheduleMeta?.amountFieldsLocked ?? false,
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
