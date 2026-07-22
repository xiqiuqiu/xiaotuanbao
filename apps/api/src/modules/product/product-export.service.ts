import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ProductScheduleStatus, ProductStatus, type ProductSchedule } from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { formatDateOnly } from '../departure/departure-date.utils'
import { renderProductPeerPackPdf } from './product-peer-pack-pdf.renderer'
import { renderProductSummaryExcel } from './product-summary-exceljs.renderer'
import type {
  ProductExportFile,
  ProductPeerPackSnapshot,
  ProductSummaryRow,
  ProductSummarySnapshot,
} from './product-export.types'

@Injectable()
export class ProductExportService {
  constructor(private readonly prisma: PrismaService) {}

  async buildPeerPackPdf(
    organizationId: string,
    productId: string,
    priced: boolean,
  ): Promise<ProductExportFile> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
      include: {
        features: { orderBy: { sortOrder: 'asc' } },
        schedules: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!product) {
      throw new NotFoundException('产品不存在')
    }

    assertExportableBasics(product.name, product.shortItinerary)
    if (priced) {
      assertHasPricedAdultSchedule(product.schedules)
    }

    const snapshot: ProductPeerPackSnapshot = {
      name: product.name,
      status: product.status,
      tags: product.tags,
      shortItinerary: product.shortItinerary,
      features: product.features.map((feature) => ({
        title: feature.title,
        description: feature.description,
      })),
      bookingNotice: product.bookingNotice,
      schedules: product.schedules.map((schedule) => ({
        title: schedule.title,
        dateRuleText: schedule.dateRuleText,
        startDate: schedule.startDate ? formatDateOnly(schedule.startDate) : null,
        endDate: schedule.endDate ? formatDateOnly(schedule.endDate) : null,
        status: schedule.status,
        priceOnInquiry: schedule.priceOnInquiry,
        adultPriceCents: schedule.adultPriceCents,
        childPriceCents: schedule.childPriceCents,
        singleRoomSupplementCents: schedule.singleRoomSupplementCents,
        notes: schedule.notes,
      })),
      priced,
    }

    return renderProductPeerPackPdf(snapshot)
  }

  async buildSummaryExcel(
    organizationId: string,
    query: {
      search?: string
      importSessionId?: string
      sourceSheetName?: string
      includeOffline?: boolean
    },
  ): Promise<ProductExportFile> {
    const search = query.search?.trim()
    const importSessionId = query.importSessionId?.trim()
    const sourceSheetName = query.sourceSheetName?.trim()
    const includeOffline = query.includeOffline === true

    const products = await this.prisma.product.findMany({
      where: {
        organizationId,
        ...(includeOffline ? {} : { status: { not: ProductStatus.offline } }),
        ...(importSessionId ? { importSessionId } : {}),
        ...(sourceSheetName ? { sourceSheetName } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { startCity: { contains: search, mode: 'insensitive' as const } },
                { endCity: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: {
        features: { orderBy: { sortOrder: 'asc' } },
        schedules: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: [{ sourceSheetName: 'asc' }, { name: 'asc' }],
    })

    const sheetMap = new Map<string, ProductSummaryRow[]>()
    for (const product of products) {
      const sheetKey = product.sourceSheetName?.trim() || '手建产品'
      const featuresText = featuresTextFromItems(product.features)
      const schedules =
        product.schedules.length > 0
          ? product.schedules.filter((s) => s.status !== ProductScheduleStatus.cancelled)
          : [null]

      for (const schedule of schedules) {
        const row: ProductSummaryRow = {
          name: product.name,
          tags: product.tags,
          shortItinerary: product.shortItinerary,
          featuresText,
          bookingNotice: product.bookingNotice,
          status: product.status,
          sourceSheetName: product.sourceSheetName,
          scheduleTitle: schedule?.title ?? '',
          dateRuleText: schedule?.dateRuleText ?? '',
          startDate: schedule?.startDate ? formatDateOnly(schedule.startDate) : null,
          endDate: schedule?.endDate ? formatDateOnly(schedule.endDate) : null,
          priceOnInquiry: schedule?.priceOnInquiry ?? false,
          adultPriceCents: schedule?.adultPriceCents ?? null,
          childPriceCents: schedule?.childPriceCents ?? null,
          singleRoomSupplementCents: schedule?.singleRoomSupplementCents ?? null,
        }
        const bucket = sheetMap.get(sheetKey) ?? []
        bucket.push(row)
        sheetMap.set(sheetKey, bucket)
      }
    }

    const snapshot: ProductSummarySnapshot = {
      sheets: [...sheetMap.entries()].map(([sheetName, rows]) => ({ sheetName, rows })),
    }
    return renderProductSummaryExcel(snapshot)
  }
}

function assertExportableBasics(name: string, shortItinerary: string): void {
  if (!name.trim()) {
    throw new BadRequestException('导出须有产品名称')
  }
  if (!shortItinerary.trim()) {
    throw new BadRequestException('导出须有简版行程')
  }
}

function assertHasPricedAdultSchedule(schedules: ProductSchedule[]): void {
  const hasAdultPrice = schedules.some(
    (schedule) =>
      schedule.status !== ProductScheduleStatus.cancelled && schedule.adultPriceCents != null,
  )
  if (!hasAdultPrice) {
    throw new BadRequestException('有价导出须至少一条有效成人价班期')
  }
}

function featuresTextFromItems(
  items: Array<{ title: string; description: string }>,
): string | null {
  if (items.length === 0) {
    return null
  }
  const blocks = items
    .map((item) => {
      if (item.title && item.description) {
        return `${item.title}\n${item.description}`
      }
      return item.title || item.description
    })
    .filter(Boolean)
  return blocks.length > 0 ? blocks.join('\n\n') : null
}
