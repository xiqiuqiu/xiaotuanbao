import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class CreateFinanceVerificationDto {
  @IsString()
  @IsNotEmpty()
  paymentScheduleId!: string

  @IsString()
  @IsNotEmpty()
  transactionId!: string

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: '金额必须大于 0' })
  amountCents!: number

  @IsDateString()
  verificationDate!: string

  @IsOptional()
  @IsString()
  remark?: string
}

export class CancelFinanceVerificationDto {
  @IsString()
  @IsNotEmpty()
  cancelReason!: string
}

export class ListFinanceVerificationsQueryDto {
  @IsOptional()
  @IsDateString()
  verificationDateStart?: string

  @IsOptional()
  @IsDateString()
  verificationDateEnd?: string

  @IsOptional()
  @IsIn(['receivable', 'payable'])
  direction?: string

  @IsOptional()
  @IsIn(['normal', 'cancelled'])
  status?: string

  @IsOptional()
  @IsString()
  transactionNo?: string

  @IsOptional()
  @IsIn(['exact', 'contains'])
  transactionNoMatch?: 'exact' | 'contains'

  @IsOptional()
  @IsString()
  scheduleNo?: string

  @IsOptional()
  @IsIn(['exact', 'contains'])
  scheduleNoMatch?: 'exact' | 'contains'

  @IsOptional()
  @IsString()
  departureKeyword?: string

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
