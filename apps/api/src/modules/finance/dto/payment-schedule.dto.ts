import {
  IsBoolean,
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
  PaymentScheduleCloseDisposition as PrismaPaymentScheduleCloseDisposition,
  PaymentScheduleDirection as PrismaPaymentScheduleDirection,
} from '@prisma/client'

export class CreatePaymentScheduleDto {
  @IsString()
  @IsNotEmpty()
  departureId!: string

  @IsString()
  @IsNotEmpty()
  title!: string

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: '金额必须大于 0' })
  amountCents!: number

  @IsDateString()
  dueDate!: string

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
  sourceType?: string

  @IsOptional()
  @IsString()
  sourceId?: string
}

export class UpdatePaymentScheduleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: '金额必须大于 0' })
  amountCents?: number

  @IsOptional()
  @IsDateString()
  dueDate?: string

  @IsOptional()
  @IsEnum(PrismaCounterpartyType)
  counterpartyType?: PrismaCounterpartyType

  @IsOptional()
  @IsString()
  counterpartyId?: string | null

  @IsOptional()
  @IsString()
  counterpartyName?: string | null
}

export class ListPaymentSchedulesQueryDto {
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

export class CancelPaymentScheduleDto {
  @IsEnum(PrismaPaymentScheduleCloseDisposition)
  closeDisposition!: PrismaPaymentScheduleCloseDisposition

  @IsString()
  @IsNotEmpty({ message: '关闭说明不能为空' })
  cancelReason!: string
}

export class ReopenPaymentScheduleDto {
  @IsString()
  @IsNotEmpty({ message: '重新打开原因不能为空' })
  reopenReason!: string

  @IsOptional()
  @IsBoolean({ message: '请确认是否联动回退发团结清' })
  confirmDepartureSettlementReversal?: boolean
}

export {
  PrismaPaymentScheduleDirection as PaymentScheduleDirection,
  PrismaPaymentScheduleCloseDisposition as PaymentScheduleCloseDisposition,
}
