import {
  IsBoolean,
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
  DepartureProgress,
} from '@xiaotuanbao/shared'
import { DepartureStatus as PrismaDepartureStatus, DepartureType as PrismaDepartureType } from '@prisma/client'

export class CreateDepartureDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsString()
  @IsNotEmpty()
  routeName!: string

  @IsDateString()
  startDate!: string

  @IsDateString()
  endDate!: string

  @IsString()
  @IsNotEmpty()
  ownerUserId!: string

  @IsOptional()
  @IsEnum(PrismaDepartureType)
  departureType?: PrismaDepartureType

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsString()
  templateId?: string

  @IsOptional()
  @IsBoolean()
  copySegments?: boolean

  @IsOptional()
  @IsBoolean()
  copyResources?: boolean

  @IsOptional()
  @IsBoolean()
  copyReferencePrices?: boolean
}

export class ListDeparturesQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsEnum(PrismaDepartureStatus)
  status?: PrismaDepartureStatus

  @IsOptional()
  @IsDateString()
  startDateFrom?: string

  @IsOptional()
  @IsDateString()
  startDateTo?: string

  @IsOptional()
  @IsString()
  routeName?: string

  @IsOptional()
  @IsEnum(PrismaDepartureType)
  departureType?: PrismaDepartureType

  @IsOptional()
  @IsIn(Object.values(DepartureProgress))
  departureProgress?: DepartureProgress

  @IsOptional()
  @IsString()
  ownerUserId?: string

  @IsOptional()
  @IsString()
  partnerId?: string

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

export class UpdateDepartureDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  routeName?: string

  @IsOptional()
  @IsEnum(PrismaDepartureType)
  departureType?: PrismaDepartureType

  @IsOptional()
  @IsDateString()
  startDate?: string

  @IsOptional()
  @IsDateString()
  endDate?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  ownerUserId?: string

  @IsOptional()
  @IsString()
  notes?: string | null
}

export class TransitionDepartureDto {
  @IsEnum(PrismaDepartureStatus)
  targetStatus!: PrismaDepartureStatus
}

export class CopyDepartureDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsDateString()
  startDate!: string

  @IsDateString()
  endDate!: string

  @IsString()
  @IsNotEmpty()
  ownerUserId!: string

  @IsOptional()
  @IsEnum(PrismaDepartureType)
  departureType?: PrismaDepartureType

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsBoolean()
  copySegments?: boolean

  @IsOptional()
  @IsBoolean()
  copyResources?: boolean

  @IsOptional()
  @IsBoolean()
  copyReferencePrices?: boolean
}
