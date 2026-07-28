import { Type } from 'class-transformer'
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator'
import { ResourceKind as PrismaResourceKind } from '@prisma/client'
import { SegmentPayableStatus } from '@xiaotuanbao/shared'

export class ListDepartureResourcesQueryDto {
  @IsOptional()
  @IsEnum(PrismaResourceKind)
  resourceKind?: PrismaResourceKind

  @IsOptional()
  @IsEnum(SegmentPayableStatus)
  payableStatus?: SegmentPayableStatus

  @IsOptional()
  @IsString()
  keyword?: string
}

export class CreateDepartureResourceDto {
  @IsEnum(PrismaResourceKind)
  resourceKind!: PrismaResourceKind

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  partnerId?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  supplierId?: string

  @IsOptional()
  @IsString()
  title?: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents!: number

  @IsOptional()
  @IsString()
  notes?: string
}

export class UpdateDepartureResourceDto {
  @IsOptional()
  @IsEnum(PrismaResourceKind)
  resourceKind?: PrismaResourceKind

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  partnerId?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  supplierId?: string

  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents?: number

  @IsOptional()
  @IsString()
  notes?: string | null
}
