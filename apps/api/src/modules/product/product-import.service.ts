import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  ProductDetail,
  ProductImportConfirmResult,
  ProductImportParseResult,
  ProductImportSessionDetail,
} from '@xiaotuanbao/shared'
import {
  ProductImportSessionStatus,
  ProductScheduleStatus,
  ProductStatus,
  ProductType,
  type Prisma,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma/prisma.service'
import { parseDateOnly } from '../departure/departure-date.utils'
import { StoredObjectService } from '../stored-object/stored-object.service'
import type {
  ConfirmImportLineDto,
  ConfirmProductImportSessionDto,
} from './dto/product-import.dto'
import { parseJiangyoujiDabaWorkbook } from './import/jiangyouji-daba.parser'
import type { JiangyoujiParseResult } from './import/jiangyouji-daba.types'
import { ProductService } from './product.service'

@Injectable()
export class ProductImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storedObjectService: StoredObjectService,
    private readonly productService: ProductService,
  ) {}

  async createSession(
    organizationId: string,
    userId: string,
    file: { originalname: string; mimetype?: string; buffer: Buffer; size: number } | undefined,
  ): Promise<ProductImportSessionDetail> {
    if (!file?.buffer?.byteLength) {
      throw new BadRequestException('请上传疆游记 xlsx（multipart 字段名 file）')
    }
    if (!looksLikeXlsx(file.originalname, file.mimetype)) {
      throw new BadRequestException('仅支持 .xlsx 疆游记总表')
    }

    let parseResult: JiangyoujiParseResult
    try {
      parseResult = await parseJiangyoujiDabaWorkbook(file.buffer)
    } catch (error) {
      throw new BadRequestException(
        `无法解析工作簿：${error instanceof Error ? error.message : '未知错误'}`,
      )
    }

    if (parseResult.sheets.length === 0) {
      throw new BadRequestException('工作簿中没有可识别的 Sheet')
    }

    const stored = await this.storedObjectService.upload(organizationId, userId, file)
    const session = await this.prisma.productImportSession.create({
      data: {
        organizationId,
        storedObjectId: stored.id,
        originalFilename: stored.originalFilename,
        parseResultJson: parseResult as unknown as Prisma.InputJsonValue,
        embeddedOleCount: parseResult.embeddedOleCount,
        createdByUserId: userId,
        status: ProductImportSessionStatus.pending_confirmation,
      },
      include: {
        products: { select: { id: true } },
      },
    })

    return this.toDetail(session)
  }

  async getSession(
    organizationId: string,
    sessionId: string,
  ): Promise<ProductImportSessionDetail> {
    const session = await this.findSessionOrThrow(organizationId, sessionId)
    return this.toDetail(session)
  }

  async confirmSession(
    organizationId: string,
    sessionId: string,
    dto: ConfirmProductImportSessionDto,
  ): Promise<ProductImportConfirmResult> {
    const session = await this.findSessionOrThrow(organizationId, sessionId)
    if (session.status !== ProductImportSessionStatus.pending_confirmation) {
      throw new BadRequestException('该导入会话已确认或已废弃，不能重复确认')
    }

    const parseResult = session.parseResultJson as unknown as JiangyoujiParseResult
    const candidateMap = new Map(
      parseResult.sheets.flatMap((sheet) => sheet.lines.map((line) => [line.candidateKey, line])),
    )

    const seenKeys = new Set<string>()
    for (const line of dto.lines) {
      if (seenKeys.has(line.candidateKey)) {
        throw new BadRequestException(`重复的候选项：${line.candidateKey}`)
      }
      seenKeys.add(line.candidateKey)
      if (!candidateMap.has(line.candidateKey)) {
        throw new BadRequestException(`未知候选项：${line.candidateKey}`)
      }
    }

    const accepted = dto.lines.filter((line) => line.action === 'accept')
    if (accepted.length === 0) {
      throw new BadRequestException('请至少接受一条线路')
    }

    for (const line of accepted) {
      assertAcceptableLine(line)
    }

    const createdProductIds: string[] = []
    await this.prisma.$transaction(async (tx) => {
      for (const line of accepted) {
        const candidate = candidateMap.get(line.candidateKey)!
        const name = line.name!.trim()
        const shortItinerary = line.shortItinerary!.trim()
        const product = await tx.product.create({
          data: {
            organizationId,
            name,
            productType: ProductType.group_join,
            status: ProductStatus.draft,
            shortItinerary,
            featuresText: normalizeNullableText(line.featuresText),
            tags: (line.tags ?? candidate.tags).map((tag) => tag.trim()).filter(Boolean),
            importSessionId: session.id,
            sourceSheetName: candidate.sheetName,
            specs: {
              create: { name: '标准' },
            },
          },
          include: { specs: true },
        })
        const spec = product.specs[0]
        if (!spec) {
          throw new BadRequestException('创建产品规格失败')
        }

        for (const schedule of line.schedules!) {
          const priceOnInquiry = schedule.priceOnInquiry === true
          const adultPriceCents = schedule.adultPriceCents ?? null
          if (!priceOnInquiry && adultPriceCents == null) {
            throw new BadRequestException(
              `线路「${name}」的班期须有成人价，或标记为询价/无报价`,
            )
          }
          await tx.productSchedule.create({
            data: {
              productId: product.id,
              productSpecId: spec.id,
              title: schedule.title?.trim() ?? '',
              dateRuleText: schedule.dateRuleText.trim(),
              startDate: parseOptionalDate(schedule.startDate),
              endDate: parseOptionalDate(schedule.endDate),
              status: ProductScheduleStatus.on_sale,
              priceOnInquiry,
              adultPriceCents,
              childPriceCents: schedule.childPriceCents ?? null,
              singleRoomSupplementCents: schedule.singleRoomSupplementCents ?? null,
              notes: normalizeNullableText(schedule.notes),
            },
          })
        }
        createdProductIds.push(product.id)
      }

      await tx.productImportSession.update({
        where: { id: session.id },
        data: {
          status: ProductImportSessionStatus.confirmed,
          confirmedAt: new Date(),
        },
      })
    })

    const createdProducts: ProductDetail[] = []
    for (const productId of createdProductIds) {
      createdProducts.push(await this.productService.getById(organizationId, productId))
    }

    const refreshed = await this.findSessionOrThrow(organizationId, sessionId)
    return {
      session: this.toDetail(refreshed),
      createdProducts,
    }
  }

  private async findSessionOrThrow(organizationId: string, sessionId: string) {
    const session = await this.prisma.productImportSession.findFirst({
      where: { id: sessionId, organizationId },
      include: {
        products: { select: { id: true }, orderBy: { createdAt: 'asc' } },
      },
    })
    if (!session) {
      throw new NotFoundException('导入会话不存在')
    }
    return session
  }

  private toDetail(session: {
    id: string
    status: ProductImportSessionStatus
    originalFilename: string
    storedObjectId: string
    embeddedOleCount: number
    parseResultJson: Prisma.JsonValue
    createdAt: Date
    confirmedAt: Date | null
    products: Array<{ id: string }>
  }): ProductImportSessionDetail {
    const parseResult = session.parseResultJson as unknown as ProductImportParseResult
    const lineCount = parseResult.sheets.reduce((sum, sheet) => sum + sheet.lines.length, 0)
    return {
      id: session.id,
      status: session.status,
      originalFilename: session.originalFilename,
      storedObjectId: session.storedObjectId,
      embeddedOleCount: session.embeddedOleCount,
      sheetCount: parseResult.sheets.length,
      lineCount,
      createdAt: session.createdAt.toISOString(),
      confirmedAt: session.confirmedAt?.toISOString() ?? null,
      parseResult,
      productIds: session.products.map((product) => product.id),
    }
  }
}

function looksLikeXlsx(filename: string, mimetype?: string): boolean {
  const lower = (filename || '').toLowerCase()
  if (lower.endsWith('.xlsx')) {
    return true
  }
  if (!mimetype) {
    return false
  }
  return (
    mimetype.includes('spreadsheetml') ||
    mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
}

function assertAcceptableLine(line: ConfirmImportLineDto): void {
  if (!line.name?.trim() || !line.shortItinerary?.trim()) {
    throw new BadRequestException('接受线路须确认名称与简版行程')
  }
  if (!line.schedules || line.schedules.length === 0) {
    throw new BadRequestException(`线路「${line.name}」须至少确认一条班期`)
  }
  const hasPricedOrInquiry = line.schedules.some(
    (schedule) => schedule.priceOnInquiry === true || schedule.adultPriceCents != null,
  )
  if (!hasPricedOrInquiry) {
    throw new BadRequestException(
      `线路「${line.name}」班期须有成人价，或明确标记无报价/询价`,
    )
  }
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value == null) {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (value == null || value === '') {
    return null
  }
  return parseDateOnly(value)
}
