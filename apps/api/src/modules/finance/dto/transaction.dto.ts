import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
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

  @IsString()
  @IsNotEmpty({ message: '请选择关联发团' })
  departureId!: string

  @IsOptional()
  @IsString()
  notes?: string
}

export class UpdateFinanceTransactionDto extends CreateFinanceTransactionDto {}

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

  /**
   * 工作台待核销流水下钻：正常流水中未核销或部分核销（剩余金额 > 0）。
   * 与 writeoffStatus 互斥；传入时强制排除已作废。
   */
  @IsOptional()
  @IsIn(['1'])
  pendingSettlement?: '1'

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
  @IsNotEmpty({ message: '作废原因不能为空' })
  @IsString()
  voidReason!: string
}
