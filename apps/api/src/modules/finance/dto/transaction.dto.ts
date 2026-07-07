import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator'
import { Type } from 'class-transformer'
import {
  CounterpartyType as PrismaCounterpartyType,
  TransactionDirection as PrismaTransactionDirection,
} from '@prisma/client'

export class CreateFinanceTransactionDto {
  @IsEnum(PrismaTransactionDirection)
  direction!: PrismaTransactionDirection

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

export class ListFinanceTransactionsQueryDto {
  @IsOptional()
  @IsString()
  departureId?: string

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
