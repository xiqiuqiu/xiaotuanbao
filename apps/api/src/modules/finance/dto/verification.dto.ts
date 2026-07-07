import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator'
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
}

export class ListFinanceVerificationsQueryDto {
  @IsOptional()
  @IsString()
  paymentScheduleId?: string

  @IsOptional()
  @IsString()
  transactionId?: string

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
