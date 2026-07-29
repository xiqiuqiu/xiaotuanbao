import { Type } from 'class-transformer'
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator'
import {
  DepartureIncomeCollectionStatus as PrismaIncomeStatus,
  DepartureIncomeCommissionStatus as PrismaCommissionStatus,
  DepartureIncomeType as PrismaIncomeType,
} from '@prisma/client'

export class CreateDepartureIncomeRecordDto {
  @IsEnum(PrismaIncomeType)
  type!: PrismaIncomeType

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  projectName!: string

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  partnerSupplierId?: string | null

  @IsOptional()
  @IsDateString()
  occurredOn?: string

  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountCents!: number

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  guideSupplierId?: string | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  commissionCents?: number

  @IsOptional()
  @IsEnum(PrismaIncomeStatus)
  incomeStatus?: PrismaIncomeStatus

  @IsOptional()
  @IsEnum(PrismaCommissionStatus)
  commissionStatus?: PrismaCommissionStatus

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  remark?: string | null
}

export class UpdateDepartureIncomeRecordDto {
  @IsOptional()
  @IsEnum(PrismaIncomeType)
  type?: PrismaIncomeType

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  projectName?: string

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  partnerSupplierId?: string | null

  @IsOptional()
  @IsDateString()
  occurredOn?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountCents?: number

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  guideSupplierId?: string | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  commissionCents?: number

  @IsOptional()
  @IsEnum(PrismaIncomeStatus)
  incomeStatus?: PrismaIncomeStatus

  @IsOptional()
  @IsEnum(PrismaCommissionStatus)
  commissionStatus?: PrismaCommissionStatus

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  remark?: string | null
}
