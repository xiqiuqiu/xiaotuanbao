import {
  IsDateString,
  IsEnum,
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
} from '@prisma/client'

export class ConfirmCollectionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: '金额必须大于 0' })
  amountCents!: number

  @IsDateString()
  transactionDate!: string

  @IsEnum(PrismaPaymentChannel)
  paymentChannel!: PrismaPaymentChannel

  @IsOptional()
  @IsEnum(PrismaCounterpartyType)
  counterpartyType?: PrismaCounterpartyType

  @IsOptional()
  @IsString()
  counterpartyId?: string

  @IsOptional()
  @IsString()
  counterpartyName?: string

  @IsOptional()
  @IsString()
  notes?: string
}

export class ConfirmPaymentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: '金额必须大于 0' })
  amountCents!: number

  @IsDateString()
  transactionDate!: string

  @IsEnum(PrismaPaymentChannel)
  paymentChannel!: PrismaPaymentChannel

  @IsOptional()
  @IsEnum(PrismaCounterpartyType)
  counterpartyType?: PrismaCounterpartyType

  @IsOptional()
  @IsString()
  counterpartyId?: string

  @IsOptional()
  @IsString()
  counterpartyName?: string

  @IsOptional()
  @IsString()
  notes?: string
}

export class LinkTransactionDto {
  @IsString()
  @IsNotEmpty()
  transactionId!: string

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: '金额必须大于 0' })
  amountCents!: number
}
