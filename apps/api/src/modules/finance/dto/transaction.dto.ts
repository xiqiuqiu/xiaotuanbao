import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator'
import { Type } from 'class-transformer'
import {
  CounterpartyType as PrismaCounterpartyType,
  PaymentChannel as PrismaPaymentChannel,
  TransactionDirection as PrismaTransactionDirection,
} from '@prisma/client'

export class CreateFinanceTransactionDto {
  @IsEnum(PrismaTransactionDirection)
  direction!: PrismaTransactionDirection

  @IsEnum(PrismaPaymentChannel)
  paymentChannel!: PrismaPaymentChannel

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: '金额必须大于 0' })
  amountCents!: number

  @IsDateString()
  transactionDate!: string

  @IsEnum(PrismaCounterpartyType)
  counterpartyType!: PrismaCounterpartyType

  @IsOptional()
  @IsString()
  counterpartyId?: string

  @IsOptional()
  @IsString()
  counterpartyName?: string

  @IsOptional()
  @IsString()
  departureId?: string

  @IsOptional()
  @IsString()
  notes?: string
}

const TRANSACTION_LIST_STATUSES = ['normal', 'voided'] as const
const TRANSACTION_WRITEOFF_STATUSES = ['none', 'partial', 'done'] as const

export class ListFinanceTransactionsQueryDto {
  @IsOptional()
  @IsString()
  departureId?: string

  @IsOptional()
  @IsDateString()
  dateStart?: string

  @IsOptional()
  @IsDateString()
  dateEnd?: string

  @IsOptional()
  @IsEnum(PrismaTransactionDirection)
  direction?: PrismaTransactionDirection

  @IsOptional()
  @IsString()
  partnerKeyword?: string

  @IsOptional()
  @IsString()
  transactionNo?: string

  @IsOptional()
  @IsIn(TRANSACTION_WRITEOFF_STATUSES)
  writeoffStatus?: (typeof TRANSACTION_WRITEOFF_STATUSES)[number]

  @IsOptional()
  @IsIn(TRANSACTION_LIST_STATUSES)
  status?: (typeof TRANSACTION_LIST_STATUSES)[number]

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number
}

export class VoidFinanceTransactionDto {
  @IsOptional()
  @IsString()
  voidReason?: string
}
