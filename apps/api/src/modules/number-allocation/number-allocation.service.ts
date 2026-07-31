import { BadRequestException, Injectable } from '@nestjs/common'
import { DocumentSequenceType, PaymentScheduleDirection, type Prisma } from '@prisma/client'
import {
  formatDepartureNo,
  formatScheduleNo,
  formatTransactionNo,
  formatVerificationNo,
  PaymentScheduleDirection as SharedPaymentScheduleDirection,
} from '@xiaotuanbao/shared'
import { PrismaService } from '../../database/prisma/prisma.service'
import {
  getShanghaiNumberingDayKey,
  getShanghaiNumberingMonthKey,
} from '../departure/departure-date.utils'

export const MISSING_BUSINESS_PREFIX_MESSAGE =
  '当前 Organization 尚未设置组织业务前缀，无法创建业务单据。请联系企业管理员完成组织配置。'

type DbClient = PrismaService | Prisma.TransactionClient

@Injectable()
export class NumberAllocationService {
  constructor(private readonly prisma: PrismaService) {}

  async previewDepartureNo(organizationId: string): Promise<string> {
    const businessPrefix = await this.requireBusinessPrefix(organizationId)
    const periodKey = getShanghaiNumberingMonthKey()
    const sequence = await this.peekNextSequence(
      organizationId,
      DocumentSequenceType.departure,
      periodKey,
    )
    return formatDepartureNo(businessPrefix, periodKey, sequence)
  }

  async allocateDepartureNo(
    organizationId: string,
    client: DbClient = this.prisma,
  ): Promise<string> {
    const businessPrefix = await this.requireBusinessPrefix(organizationId, client)
    const periodKey = getShanghaiNumberingMonthKey()
    const sequence = await this.nextSequence(
      organizationId,
      DocumentSequenceType.departure,
      periodKey,
      client,
    )
    return formatDepartureNo(businessPrefix, periodKey, sequence)
  }

  async allocateScheduleNo(
    organizationId: string,
    direction: PaymentScheduleDirection,
    client: DbClient = this.prisma,
  ): Promise<string> {
    const businessPrefix = await this.requireBusinessPrefix(organizationId, client)
    const periodKey = getShanghaiNumberingMonthKey()
    const documentType =
      direction === PaymentScheduleDirection.receivable
        ? DocumentSequenceType.ar
        : DocumentSequenceType.ap
    const sharedDirection =
      direction === PaymentScheduleDirection.receivable
        ? SharedPaymentScheduleDirection.RECEIVABLE
        : SharedPaymentScheduleDirection.PAYABLE
    const sequence = await this.nextSequence(organizationId, documentType, periodKey, client)
    return formatScheduleNo(sharedDirection, businessPrefix, periodKey, sequence)
  }

  async allocateTransactionNo(
    organizationId: string,
    client: DbClient = this.prisma,
  ): Promise<string> {
    const businessPrefix = await this.requireBusinessPrefix(organizationId, client)
    const periodKey = getShanghaiNumberingDayKey()
    const sequence = await this.nextSequence(
      organizationId,
      DocumentSequenceType.tx,
      periodKey,
      client,
    )
    return formatTransactionNo(businessPrefix, periodKey, sequence)
  }

  async allocateVerificationNo(
    organizationId: string,
    client: DbClient = this.prisma,
  ): Promise<string> {
    const businessPrefix = await this.requireBusinessPrefix(organizationId, client)
    const periodKey = getShanghaiNumberingMonthKey()
    const sequence = await this.nextSequence(
      organizationId,
      DocumentSequenceType.cl,
      periodKey,
      client,
    )
    return formatVerificationNo(businessPrefix, periodKey, sequence)
  }

  private async requireBusinessPrefix(
    organizationId: string,
    client: DbClient = this.prisma,
  ): Promise<string> {
    const organization = await client.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { businessPrefix: true },
    })

    if (!organization?.businessPrefix) {
      throw new BadRequestException(MISSING_BUSINESS_PREFIX_MESSAGE)
    }

    return organization.businessPrefix
  }

  private async peekNextSequence(
    organizationId: string,
    documentType: DocumentSequenceType,
    periodKey: string,
  ): Promise<number> {
    const row = await this.prisma.documentSequence.findUnique({
      where: {
        organizationId_documentType_periodKey: {
          organizationId,
          documentType,
          periodKey,
        },
      },
      select: { lastSequence: true },
    })

    return (row?.lastSequence ?? 0) + 1
  }

  private async nextSequence(
    organizationId: string,
    documentType: DocumentSequenceType,
    periodKey: string,
    client: DbClient,
  ): Promise<number> {
    const row = await client.documentSequence.upsert({
      where: {
        organizationId_documentType_periodKey: {
          organizationId,
          documentType,
          periodKey,
        },
      },
      create: {
        organizationId,
        documentType,
        periodKey,
        lastSequence: 1,
      },
      update: {
        lastSequence: { increment: 1 },
      },
    })

    return row.lastSequence
  }
}
