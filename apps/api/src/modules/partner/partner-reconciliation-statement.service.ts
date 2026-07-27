import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  PartnerReconciliationStatementRow,
  PartnerReconciliationStatementSnapshot,
} from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'
import { formatDateOnly, parseDateOnly } from '../departure/departure-date.utils'
import { computeCollectionSettlementPreview } from '../departure/source-order.utils'
import {
  PartnerReconciliationStatementExcelRenderer,
  buildReconciliationStatementTitle,
  type PartnerReconciliationStatementExcelFile,
} from './partner-reconciliation-statement-excel.types'

/**
 * 《往来账确认单》快照（#112 口径）：行＝周期内该 Partner 全部客源单
 * （含已关闭应收、不标记），按出团日期正序；只含业务事实与收款拆分，
 * 不含核销进度；手工其他应收无客源单载体、天然排除。
 * 即时生成当前快照、不存副本（ADR-0018 快照＋渲染边界模式）。
 */
@Injectable()
export class PartnerReconciliationStatementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excelRenderer: PartnerReconciliationStatementExcelRenderer,
  ) {}

  async buildWorkbook(
    organizationId: string,
    partnerId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<PartnerReconciliationStatementExcelFile> {
    const snapshot = await this.buildSnapshot(
      organizationId,
      partnerId,
      periodStart,
      periodEnd,
    )
    return this.excelRenderer.render(snapshot)
  }

  async buildSnapshot(
    organizationId: string,
    partnerId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<PartnerReconciliationStatementSnapshot> {
    const partner = await this.prisma.partner.findFirst({
      where: { id: partnerId, organizationId },
      include: { organization: { select: { name: true } } },
    })
    if (!partner) {
      throw new NotFoundException('合作伙伴不存在')
    }

    if (periodStart > periodEnd) {
      throw new BadRequestException('对账周期区间非法')
    }

    const orders = await this.prisma.sourceOrder.findMany({
      where: {
        partnerId: partner.id,
        departure: {
          organizationId,
          startDate: {
            gte: parseDateOnly(periodStart),
            lte: parseDateOnly(periodEnd),
          },
        },
      },
      include: {
        departure: {
          select: { departureNo: true, routeName: true, startDate: true },
        },
        // 游客代表：客人名单按创建时间最早一条（Guest Representative 既有规则）
        guests: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { name: true, phone: true },
        },
      },
      orderBy: [{ departure: { startDate: 'asc' } }, { createdAt: 'asc' }],
    })

    const rows: PartnerReconciliationStatementRow[] = orders.map((order) => {
      const representative = order.guests[0] ?? null
      // 确认单口径（#191）：押金列＝P；客户补款＝轧差 max(0,S−G)；游客代收＝G约定
      const { estimatedCustomerTopUpCents: customerTopUpCents } =
        computeCollectionSettlementPreview(
          order.netReceivableCents,
          order.guestCollectCents,
        )
      return {
        sourceOrderId: order.id,
        departureId: order.departureId,
        departureDate: formatDateOnly(order.departure.startDate),
        departureNo: order.departure.departureNo,
        routeName: order.departure.routeName,
        guestRepresentativeName: representative?.name ?? null,
        guestRepresentativePhone: representative?.phone ?? null,
        adultGuestCount: order.adultGuestCount,
        childGuestCount: order.childGuestCount,
        totalGuestCount: order.guestCount,
        adultUnitPriceCents: order.adultUnitPriceCents,
        childUnitPriceCents: order.childUnitPriceCents,
        originalReceivableCents: order.grossReceivableCents,
        fareAdjustmentNetCents: order.fareAdjustmentNetCents,
        discountCents: order.discountCents,
        actualReceivableCents: order.netReceivableCents,
        customerDepositCents: order.partnerCollectedCents,
        customerTopUpCents,
        guestCollectCents: order.guestCollectCents,
        notes: order.notes,
      }
    })

    return {
      title: buildReconciliationStatementTitle(periodStart, periodEnd),
      organizationName: partner.organization.name,
      partnerId: partner.id,
      partnerName: partner.name,
      periodStart,
      periodEnd,
      exportedAt: new Date().toISOString(),
      totals: {
        orderCount: rows.length,
        adultGuestCount: rows.reduce((sum, row) => sum + row.adultGuestCount, 0),
        childGuestCount: rows.reduce((sum, row) => sum + row.childGuestCount, 0),
        totalGuestCount: rows.reduce((sum, row) => sum + row.totalGuestCount, 0),
        originalReceivableCents: rows.reduce(
          (sum, row) => sum + row.originalReceivableCents,
          0,
        ),
        fareAdjustmentNetCents: rows.reduce(
          (sum, row) => sum + row.fareAdjustmentNetCents,
          0,
        ),
        discountCents: rows.reduce((sum, row) => sum + row.discountCents, 0),
        actualReceivableCents: rows.reduce(
          (sum, row) => sum + row.actualReceivableCents,
          0,
        ),
        customerDepositCents: rows.reduce(
          (sum, row) => sum + row.customerDepositCents,
          0,
        ),
        customerTopUpCents: rows.reduce((sum, row) => sum + row.customerTopUpCents, 0),
        guestCollectCents: rows.reduce((sum, row) => sum + row.guestCollectCents, 0),
      },
      rows,
    }
  }
}
